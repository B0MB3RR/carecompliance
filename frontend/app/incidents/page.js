'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

const INCIDENT_TYPES = [
  { value: 'accident', label: 'Accident' },
  { value: 'safeguarding_concern', label: 'Safeguarding concern' },
  { value: 'medication_error', label: 'Medication error' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'near_miss', label: 'Near miss' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_COLOR = { low: 'ok', medium: 'warning', high: 'warning', critical: 'critical' };

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [form, setForm] = useState({
    incidentType: 'near_miss',
    severity: 'low',
    incidentDate: new Date().toISOString().split('T')[0],
    description: '',
    clientRelated: true,
    staffInvolved: '',
    notifiableToCqc: false,
  });
  const [submitting, setSubmitting] = useState(false);

  async function load(status) {
    try {
      const query = status ? `?status=${status}` : '';
      const data = await api.get(`/incidents${query}`);
      setIncidents(data.incidents);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(filterStatus); }, [filterStatus]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/incidents', form);
      setForm({ ...form, description: '', staffInvolved: '' });
      await load(filterStatus);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function advanceStatus(item) {
    const next = { open: 'under_review', under_review: 'closed', closed: 'open' }[item.status];
    await api.patch(`/incidents/${item.id}`, { status: next });
    await load(filterStatus);
  }

  function handleExportCsv() {
    const header = ['Date', 'Type', 'Severity', 'Description', 'Client related', 'Staff involved', 'CQC notifiable', 'Status', 'Actions taken'];
    const rows = incidents.map((i) => [
      new Date(i.incident_date).toLocaleDateString('en-GB'),
      i.incident_type.replace('_', ' '),
      i.severity,
      i.description,
      i.client_related ? 'Yes' : 'No',
      i.staff_involved || '',
      i.notifiable_to_cqc ? 'Yes' : 'No',
      i.status.replace('_', ' '),
      i.actions_taken || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidents-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Safeguarding & incident management</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Incidents</h1>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      <div className="split-grid">
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Log an incident</div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Type</label>
            <select value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value })}>
              {INCIDENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Severity</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Date</label>
            <input type="date" value={form.incidentDate} onChange={(e) => setForm({ ...form, incidentDate: e.target.value })} required />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Description</label>
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Staff involved (optional)</label>
            <input type="text" value={form.staffInvolved} onChange={(e) => setForm({ ...form, staffInvolved: e.target.value })} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={form.clientRelated} onChange={(e) => setForm({ ...form, clientRelated: e.target.checked })} style={{ width: 'auto' }} />
            Relates to a client
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={form.notifiableToCqc} onChange={(e) => setForm({ ...form, notifiableToCqc: e.target.checked })} style={{ width: 'auto' }} />
            Notifiable to CQC
          </label>

          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Logging…' : 'Log incident'}</button>
        </form>

        <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['', 'open', 'under_review', 'closed'].map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => setFilterStatus(s)}
                  className="btn-secondary"
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    background: filterStatus === s ? 'var(--color-ink)' : 'transparent',
                    color: filterStatus === s ? 'var(--color-bg)' : 'var(--color-ink)',
                    borderColor: filterStatus === s ? 'var(--color-ink)' : 'var(--color-border)',
                  }}
                >
                  {s ? s.replace('_', ' ') : 'All'}
                </button>
              ))}
            </div>
            {incidents.length > 0 && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleExportCsv}>
                Export CSV
              </button>
            )}
          </div>

          {incidents.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No incidents match this filter.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {incidents.map((inc) => (
                <div key={inc.id} className="card" style={{ padding: 14, border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`status-dot status-${SEVERITY_COLOR[inc.severity]}`} />
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {INCIDENT_TYPES.find((t) => t.value === inc.incident_type)?.label} · {inc.severity}
                        </span>
                        {inc.notifiable_to_cqc && (
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-critical)' }}>CQC notifiable</span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginBottom: 4 }}>
                        {new Date(inc.incident_date).toLocaleDateString('en-GB')}
                        {inc.reported_by_first_name && ` · reported by ${inc.reported_by_first_name} ${inc.reported_by_last_name}`}
                      </div>
                      <div style={{ fontSize: 13 }}>{inc.description}</div>
                    </div>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => advanceStatus(inc)}>
                      {inc.status.replace('_', ' ')} →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
