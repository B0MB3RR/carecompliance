'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

const TABS = ['Users', 'Company Settings', 'Audit Trail'];

export default function AdminPage() {
  const [tab, setTab] = useState('Users');

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Administration</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Administration</h1>
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

      {tab === 'Users' && <UsersPanel />}
      {tab === 'Company Settings' && <CompanyPanel />}
      {tab === 'Audit Trail' && <AuditPanel />}
    </AppShell>
  );
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'staff' });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const data = await api.get('/users');
      setUsers(data.users);
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
      await api.post('/users', form);
      setForm({ email: '', password: '', firstName: '', lastName: '', role: 'staff' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id) {
    if (!confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="split-grid">
      <form onSubmit={handleCreate} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="label-eyebrow">Add a user</div>
        <input type="text" placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        <input type="text" placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input type="password" placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
          <option value="company_admin">Company Admin</option>
        </select>
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Adding…' : 'Add user'}</button>
      </form>

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        {error && <div style={{ color: 'var(--color-critical)', marginBottom: 12 }}>{error}</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '8px 6px' }}>Name</th>
              <th style={{ padding: '8px 6px' }}>Email</th>
              <th style={{ padding: '8px 6px' }}>Role</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
              <th style={{ padding: '8px 6px' }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 6px' }}>{u.first_name} {u.last_name}</td>
                <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{u.email}</td>
                <td style={{ padding: '10px 6px' }}>{u.role.replace('_', ' ')}</td>
                <td style={{ padding: '10px 6px' }}>
                  <span className={`status-dot status-${u.is_active ? 'ok' : 'critical'}`} /> {u.is_active ? 'Active' : 'Inactive'}
                </td>
                <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                  {u.is_active && (
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => handleDeactivate(u.id)}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompanyPanel() {
  const [company, setCompany] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoCacheBust, setLogoCacheBust] = useState(0);

  useEffect(() => {
    api.get('/company').then((d) => setCompany(d.company)).catch((err) => setError(err.message));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const data = await api.patch('/company', {
        name: company.name,
        cqcRegistrationNo: company.cqc_registration_no,
        addressLine1: company.address_line1,
        addressLine2: company.address_line2,
        city: company.city,
        postcode: company.postcode,
        phone: company.phone,
      });
      setCompany(data.company);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e) {
    e.preventDefault();
    if (!logoFile) return;
    setUploadingLogo(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      await api.postForm('/company/logo', formData);
      setLogoFile(null);
      setLogoCacheBust((n) => n + 1); // force the <img> below to refetch
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  if (!company) return <div className="label-eyebrow">Loading…</div>;

  const apiRoot = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/api$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
      <form onSubmit={handleLogoUpload} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="label-eyebrow">Company logo</div>
        <div style={{ fontSize: 13, color: 'var(--color-ink-soft)' }}>
          Shown in the sidebar and on generated PDF reports. PNG, JPEG, or WebP recommended (SVG uploads are supported for the sidebar, but PDF reports need a PNG/JPEG to render the logo).
        </div>

        {company.logo_storage_path && (
          <img
            key={logoCacheBust}
            src={`${apiRoot}/api/branding/${company.id}/logo?v=${logoCacheBust}`}
            alt="Current logo"
            style={{ maxHeight: 60, maxWidth: 200, border: '1px solid var(--color-border)', borderRadius: 6, padding: 6 }}
          />
        )}

        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
        <button type="submit" className="btn-secondary" disabled={!logoFile || uploadingLogo} style={{ alignSelf: 'flex-start' }}>
          {uploadingLogo ? 'Uploading…' : 'Upload logo'}
        </button>
      </form>

      <form onSubmit={handleSave} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="label-eyebrow">Organisation details</div>

        <Field label="Organisation name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
        <Field label="CQC registration number" value={company.cqc_registration_no || ''} onChange={(v) => setCompany({ ...company, cqc_registration_no: v })} />
        <Field label="Address line 1" value={company.address_line1 || ''} onChange={(v) => setCompany({ ...company, address_line1: v })} />
        <Field label="Address line 2" value={company.address_line2 || ''} onChange={(v) => setCompany({ ...company, address_line2: v })} />
        <Field label="City" value={company.city || ''} onChange={(v) => setCompany({ ...company, city: v })} />
        <Field label="Postcode" value={company.postcode || ''} onChange={(v) => setCompany({ ...company, postcode: v })} />
        <Field label="Phone" value={company.phone || ''} onChange={(v) => setCompany({ ...company, phone: v })} />

        {error && <div style={{ color: 'var(--color-critical)' }}>{error}</div>}
        {saved && <div style={{ color: 'var(--color-accent)' }}>Saved.</div>}

        <button type="submit" className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AuditPanel() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/audit').then((d) => setEntries(d.auditLog)).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 12 }}>{error}</div>}
      {entries.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No audit activity recorded yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '8px 6px' }}>When</th>
              <th style={{ padding: '8px 6px' }}>User</th>
              <th style={{ padding: '8px 6px' }}>Action</th>
              <th style={{ padding: '8px 6px' }}>Entity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{new Date(e.created_at).toLocaleString('en-GB')}</td>
                <td style={{ padding: '10px 6px' }}>{e.first_name ? `${e.first_name} ${e.last_name}` : 'System'}</td>
                <td style={{ padding: '10px 6px' }}>{e.action.replace(/_/g, ' ')}</td>
                <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{e.entity_type || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
