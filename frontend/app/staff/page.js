'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

const TABS = ['Training Matrix', 'Staff Directory', 'Supervisions'];
const CAN_EDIT_ROLES = ['company_admin', 'manager', 'super_admin'];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function trainingCellStatus(cell) {
  if (!cell.completed_date) return 'missing';
  const days = daysUntil(cell.expiry_date);
  if (cell.expiry_date && days < 0) return 'expired';
  if (cell.expiry_date && days <= 60) return 'expiring';
  return 'valid';
}

const CELL_STYLE = {
  valid: { background: 'var(--color-accent-soft)', color: 'var(--color-accent)' },
  expiring: { background: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  expired: { background: 'var(--color-critical-soft)', color: 'var(--color-critical)' },
  missing: { background: 'var(--color-surface-muted)', color: 'var(--color-ink-soft)' },
};

export default function StaffPage() {
  const [tab, setTab] = useState('Training Matrix');
  const { user } = useAuth();
  const canEdit = CAN_EDIT_ROLES.includes(user?.role);

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Workforce compliance</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Staff & Training</h1>
        {!canEdit && (
          <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 6 }}>
            You have view-only access. Ask a manager or company admin to grant you edit permission from Administration → Users.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'transparent',
              padding: '10px 4px',
              marginRight: 20,
              borderRadius: 0,
              borderBottom: tab === t ? '2px solid var(--color-ink)' : '2px solid transparent',
              color: tab === t ? 'var(--color-ink)' : 'var(--color-ink-soft)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Training Matrix' && <TrainingMatrixPanel canEdit={canEdit} />}
      {tab === 'Staff Directory' && <StaffDirectoryPanel canEdit={canEdit} />}
      {tab === 'Supervisions' && <SupervisionsPanel canEdit={canEdit} />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------
// Training Matrix — record completions, plus (for admins/managers) add or
// remove the courses that make up the matrix itself, and export to CSV.
// ---------------------------------------------------------------------

function TrainingMatrixPanel({ canEdit }) {
  const [matrix, setMatrix] = useState([]);
  const [error, setError] = useState('');
  const [staffOptions, setStaffOptions] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);
  const [form, setForm] = useState({ staffId: '', courseTypeId: '', completedDate: new Date().toISOString().split('T')[0] });
  const [submitting, setSubmitting] = useState(false);
  const [showCourseManager, setShowCourseManager] = useState(false);
  const [courseForm, setCourseForm] = useState({ name: '', isMandatory: true, renewalPeriodMonths: '12' });
  const [courseSubmitting, setCourseSubmitting] = useState(false);

  async function load() {
    try {
      const [matrixData, staffData, coursesData] = await Promise.all([
        api.get('/staff/training-matrix'),
        api.get('/staff'),
        api.get('/staff/course-types'),
      ]);
      setMatrix(matrixData.matrix);
      setStaffOptions(staffData.staff.filter((s) => s.employment_status === 'active'));
      setCourseOptions(coursesData.courseTypes);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  // Pivot the flat matrix rows into staff -> { courseTypeId: cell }
  const staffMap = {};
  matrix.forEach((row) => {
    if (!staffMap[row.staff_id]) {
      staffMap[row.staff_id] = { first_name: row.first_name, last_name: row.last_name, job_title: row.job_title, courses: {} };
    }
    staffMap[row.staff_id].courses[row.course_type_id] = row;
  });
  const courseColumns = [...new Map(matrix.map((r) => [r.course_type_id, r.course_name])).entries()];

  async function handleRecord(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/staff/training-records', form);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCourse(e) {
    e.preventDefault();
    setCourseSubmitting(true);
    setError('');
    try {
      await api.post('/staff/course-types', {
        name: courseForm.name,
        isMandatory: courseForm.isMandatory,
        renewalPeriodMonths: courseForm.renewalPeriodMonths ? Number(courseForm.renewalPeriodMonths) : null,
      });
      setCourseForm({ name: '', isMandatory: true, renewalPeriodMonths: '12' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCourseSubmitting(false);
    }
  }

  async function handleRemoveCourse(courseId, courseName) {
    if (!confirm(`Remove "${courseName}" from the matrix? Past completion records for this course are kept for audit purposes, but it will no longer appear on the live matrix or in new compliance checks.`)) return;
    try {
      await api.delete(`/staff/course-types/${courseId}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleExportCsv() {
    const header = ['Staff member', 'Job title', ...courseColumns.map(([, name]) => name)];
    const rows = Object.values(staffMap).map((s) => [
      `${s.first_name} ${s.last_name}`,
      s.job_title || '',
      ...courseColumns.map(([courseId]) => {
        const cell = s.courses[courseId];
        return cell?.completed_date ? `Completed ${cell.completed_date}${cell.expiry_date ? `, expires ${cell.expiry_date}` : ''}` : 'Not recorded';
      }),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-matrix-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {canEdit && (
        <form onSubmit={handleRecord} className="card" style={{ padding: 20, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Staff member</label>
            <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} required>
              <option value="">Select…</option>
              {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Course</label>
            <select value={form.courseTypeId} onChange={(e) => setForm({ ...form, courseTypeId: e.target.value })} required>
              <option value="">Select…</option>
              {courseOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Completed on</label>
            <input type="date" value={form.completedDate} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} required />
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Record completion'}</button>
        </form>
      )}

      {canEdit && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <button
            className="btn-secondary"
            style={{ fontSize: 13, padding: '6px 12px' }}
            onClick={() => setShowCourseManager((v) => !v)}
          >
            {showCourseManager ? 'Hide course manager' : 'Manage courses on this matrix'}
          </button>

          {showCourseManager && (
            <div style={{ marginTop: 16 }}>
              <form onSubmit={handleAddCourse} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>New course name</label>
                  <input type="text" placeholder="e.g. Dementia Care Awareness" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} required />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Renewal (months)</label>
                  <input type="number" min="0" placeholder="Leave blank if it never expires" value={courseForm.renewalPeriodMonths} onChange={(e) => setCourseForm({ ...courseForm, renewalPeriodMonths: e.target.value })} style={{ width: 100 }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={courseForm.isMandatory} onChange={(e) => setCourseForm({ ...courseForm, isMandatory: e.target.checked })} />
                  Mandatory
                </label>
                <button type="submit" className="btn-primary" disabled={courseSubmitting}>{courseSubmitting ? 'Adding…' : 'Add course'}</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {courseOptions.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--color-surface-subtle)', borderRadius: 6, fontSize: 13 }}>
                    <span>{c.name} {c.is_mandatory && <span style={{ color: 'var(--color-ink-soft)' }}>(mandatory)</span>}</span>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleRemoveCourse(c.id, c.name)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <Legend color="ok" label="Valid" />
            <Legend color="warning" label="Expiring within 60 days" />
            <Legend color="critical" label="Expired" />
            <Legend color="" label="Not recorded" muted />
          </div>
          {courseColumns.length > 0 && (
            <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleExportCsv}>
              Export CSV
            </button>
          )}
        </div>
        {courseColumns.length === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>
            No training courses configured yet.{canEdit ? ' Use "Manage courses on this matrix" above to add your first course.' : ' Ask a manager or company admin to set up the courses your company wants to track.'}
          </div>
        ) : (
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 10px', position: 'sticky', left: 0, background: 'var(--color-surface)' }}>Staff</th>
                {courseColumns.map(([id, name]) => (
                  <th key={id} style={{ padding: '8px 10px', fontWeight: 600, minWidth: 140 }}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(staffMap).map(([staffId, s]) => (
                <tr key={staffId} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--color-surface)' }}>
                    {s.first_name} {s.last_name}
                    <div style={{ fontSize: 11, color: 'var(--color-ink-soft)', fontWeight: 400 }}>{s.job_title}</div>
                  </td>
                  {courseColumns.map(([courseId]) => {
                    const cell = s.courses[courseId] || {};
                    const status = trainingCellStatus(cell);
                    return (
                      <td key={courseId} style={{ padding: 6 }}>
                        <div style={{ padding: '6px 8px', borderRadius: 6, textAlign: 'center', ...CELL_STYLE[status] }}>
                          {cell.expiry_date ? new Date(cell.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: muted ? 'var(--color-surface-muted)' : `var(--color-${color === 'ok' ? 'accent' : color})` }} />
      <span style={{ color: 'var(--color-ink-soft)' }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Staff Directory — add staff, and (for admins/managers) edit role,
// DBS status/expiry, and employment status inline. Also shows a
// transparent per-person training compliance scorecard.
// ---------------------------------------------------------------------

const EMPTY_FORM = { firstName: '', lastName: '', jobTitle: '', startDate: '', dbsCertificateNo: '', dbsExpiryDate: '', dbsStatus: 'clear' };

function StaffDirectoryPanel({ canEdit }) {
  const [staff, setStaff] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [staffData, matrixData] = await Promise.all([api.get('/staff'), api.get('/staff/training-matrix')]);
      setStaff(staffData.staff);
      setMatrix(matrixData.matrix);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  // Transparent compliance score: share of that person's mandatory courses
  // that are currently valid (completed and not expired). Not a black box -
  // hovering the value shows exactly which courses are missing.
  const complianceByStaff = useMemo(() => {
    const map = {};
    matrix.forEach((row) => {
      if (!row.is_mandatory) return;
      map[row.staff_id] = map[row.staff_id] || { total: 0, valid: 0, missing: [] };
      map[row.staff_id].total += 1;
      const status = trainingCellStatus(row);
      if (status === 'valid') map[row.staff_id].valid += 1;
      else map[row.staff_id].missing.push(row.course_name);
    });
    return map;
  }, [matrix]);

  function startEdit(s) {
    setEditingId(s.id);
    setEditForm({
      jobTitle: s.job_title || '',
      employmentStatus: s.employment_status,
      dbsStatus: s.dbs_status,
      dbsExpiryDate: s.dbs_expiry_date ? s.dbs_expiry_date.split('T')[0] : '',
    });
  }

  async function saveEdit(id) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/staff/${id}`, editForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/staff', form);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={canEdit ? 'split-grid' : ''} style={!canEdit ? { display: 'grid', gap: 24 } : undefined}>
      {canEdit && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Add staff member</div>
          <input type="text" placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <input type="text" placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <input type="text" placeholder="Job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Start date</label>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <input type="text" placeholder="DBS certificate no." value={form.dbsCertificateNo} onChange={(e) => setForm({ ...form, dbsCertificateNo: e.target.value })} />
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DBS expiry date</label>
            <input type="date" value={form.dbsExpiryDate} onChange={(e) => setForm({ ...form, dbsExpiryDate: e.target.value })} />
          </div>
          <select value={form.dbsStatus} onChange={(e) => setForm({ ...form, dbsStatus: e.target.value })}>
            <option value="clear">DBS: Clear</option>
            <option value="pending">DBS: Pending</option>
            <option value="not_started">DBS: Not started</option>
            <option value="flagged">DBS: Flagged</option>
          </select>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Adding…' : 'Add staff member'}</button>
        </form>
      )}

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        {error && <div style={{ color: 'var(--color-critical)', marginBottom: 12 }}>{error}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '8px 6px' }}>Name</th>
              <th style={{ padding: '8px 6px' }}>Role</th>
              <th style={{ padding: '8px 6px' }}>DBS status</th>
              <th style={{ padding: '8px 6px' }}>DBS expiry</th>
              <th style={{ padding: '8px 6px' }}>Employment</th>
              <th style={{ padding: '8px 6px' }}>Training compliance</th>
              {canEdit && <th style={{ padding: '8px 6px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const isEditing = editingId === s.id;
              const compliance = complianceByStaff[s.id];
              const pct = compliance && compliance.total > 0 ? Math.round((compliance.valid / compliance.total) * 100) : null;

              if (isEditing) {
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-subtle)' }}>
                    <td style={{ padding: '10px 6px' }}>{s.first_name} {s.last_name}</td>
                    <td style={{ padding: '10px 6px' }}>
                      <input type="text" value={editForm.jobTitle} onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })} style={{ width: 140 }} />
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <select value={editForm.dbsStatus} onChange={(e) => setEditForm({ ...editForm, dbsStatus: e.target.value })}>
                        <option value="clear">Clear</option>
                        <option value="pending">Pending</option>
                        <option value="not_started">Not started</option>
                        <option value="flagged">Flagged</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <input type="date" value={editForm.dbsExpiryDate} onChange={(e) => setEditForm({ ...editForm, dbsExpiryDate: e.target.value })} style={{ width: 150 }} />
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <select value={editForm.employmentStatus} onChange={(e) => setEditForm({ ...editForm, employmentStatus: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="on_leave">On leave</option>
                        <option value="left">Left</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>—</td>
                    <td style={{ padding: '10px 6px', whiteSpace: 'nowrap' }}>
                      <button className="btn-primary" style={{ fontSize: 12, padding: '5px 10px', marginRight: 6 }} disabled={saving} onClick={() => saveEdit(s.id)}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 6px' }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{s.job_title || '—'}</td>
                  <td style={{ padding: '10px 6px' }}>
                    <span className={`status-dot status-${s.dbs_status === 'clear' ? 'ok' : s.dbs_status === 'flagged' ? 'critical' : 'warning'}`} /> {s.dbs_status.replace('_', ' ')}
                  </td>
                  <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>
                    {s.dbs_expiry_date ? new Date(s.dbs_expiry_date).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{s.employment_status.replace('_', ' ')}</td>
                  <td style={{ padding: '10px 6px' }}>
                    {pct === null ? (
                      <span style={{ color: 'var(--color-ink-soft)' }}>—</span>
                    ) : (
                      <span
                        title={compliance.missing.length > 0 ? `Missing/expired: ${compliance.missing.join(', ')}` : 'All mandatory training up to date'}
                        className={`status-dot status-${pct === 100 ? 'ok' : pct >= 60 ? 'warning' : 'critical'}`}
                        style={{ marginRight: 6 }}
                      />
                    )}
                    {pct !== null && `${pct}%`}
                  </td>
                  {canEdit && (
                    <td style={{ padding: '10px 6px' }}>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => startEdit(s)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Supervisions
// ---------------------------------------------------------------------

function SupervisionsPanel({ canEdit }) {
  const [supervisions, setSupervisions] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ staffId: '', supervisionDate: new Date().toISOString().split('T')[0], nextDueDate: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const [supData, staffData] = await Promise.all([api.get('/staff/supervisions'), api.get('/staff')]);
      setSupervisions(supData.supervisions);
      setStaffOptions(staffData.staff.filter((s) => s.employment_status === 'active'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/staff/supervisions', form);
      setForm({ ...form, notes: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const staffById = Object.fromEntries(staffOptions.map((s) => [s.id, s]));

  return (
    <div className={canEdit ? 'split-grid' : ''} style={!canEdit ? { display: 'grid', gap: 24 } : undefined}>
      {canEdit && (
        <form onSubmit={handleCreate} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Log a supervision</div>
          <select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} required>
            <option value="">Select staff member…</option>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Supervision date</label>
            <input type="date" value={form.supervisionDate} onChange={(e) => setForm({ ...form, supervisionDate: e.target.value })} required />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Next due</label>
            <input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} />
          </div>
          <textarea rows={3} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Log supervision'}</button>
        </form>
      )}

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        {error && <div style={{ color: 'var(--color-critical)', marginBottom: 12 }}>{error}</div>}
        {supervisions.length === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No supervisions logged yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '8px 6px' }}>Staff</th>
                <th style={{ padding: '8px 6px' }}>Date</th>
                <th style={{ padding: '8px 6px' }}>Next due</th>
                <th style={{ padding: '8px 6px' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {supervisions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 6px' }}>{staffById[s.staff_id] ? `${staffById[s.staff_id].first_name} ${staffById[s.staff_id].last_name}` : '—'}</td>
                  <td style={{ padding: '10px 6px' }}>{new Date(s.supervision_date).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{s.next_due_date ? new Date(s.next_due_date).toLocaleDateString('en-GB') : '—'}</td>
                  <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{s.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
