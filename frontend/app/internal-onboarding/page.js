'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

const PROVIDER_TYPES = [
  { value: 'home_care', label: 'Home Care' },
  { value: 'residential_care', label: 'Residential Care' },
  { value: 'supported_living', label: 'Supported Living' },
];

const EMPTY_FORM = { companyName: '', providerType: 'home_care', cqcRegistrationNo: '', adminFirstName: '', adminLastName: '', adminEmail: '' };

export default function InternalOnboardingPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  async function load() {
    try {
      const data = await api.get('/internal/companies');
      setCompanies(data.companies);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  if (user && user.role !== 'super_admin') {
    return (
      <AppShell>
        <div className="card" style={{ padding: 24, fontSize: 14, color: 'var(--color-ink-soft)' }}>
          This page is only available to CareCompliance Intelligence platform staff.
        </div>
      </AppShell>
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setJustCreated(null);
    try {
      const data = await api.post('/internal/companies', form);
      setJustCreated(data);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(company) {
    const verb = company.is_active ? 'suspend' : 'reactivate';
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} "${company.name}"? ${company.is_active ? 'Their users will be unable to log in until reactivated.' : ''}`)) return;
    try {
      await api.patch(`/internal/companies/${company.id}/active`, { isActive: !company.is_active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Platform administration</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Company Onboarding</h1>
        <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 6 }}>
          Register a new customer here. There's no self-service sign-up — every company on the platform is provisioned by CareCompliance Intelligence staff.
        </div>
      </div>

      {justCreated && (
        <div className="card" style={{ padding: 20, marginBottom: 20, border: '1px solid var(--color-accent)', background: 'var(--color-accent-soft)' }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>
            {justCreated.company.name} registered — send these details to {justCreated.admin.email}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginBottom: 12 }}>
            This is the only time the temporary password is shown. There's no email delivery wired up yet, so relay these to the customer yourself (phone, secure email, etc).
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <CredentialRow label="Registration ID" value={justCreated.company.registrationId} onCopy={copyToClipboard} />
            <CredentialRow label="Email" value={justCreated.admin.email} onCopy={copyToClipboard} />
            <CredentialRow label="Temporary password" value={justCreated.temporaryPassword} onCopy={copyToClipboard} />
          </div>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', marginTop: 14 }} onClick={() => setJustCreated(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="split-grid">
        <form onSubmit={handleCreate} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Register a new company</div>
          <input type="text" placeholder="Organisation name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
          <select value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })}>
            {PROVIDER_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input type="text" placeholder="CQC registration no. (optional)" value={form.cqcRegistrationNo} onChange={(e) => setForm({ ...form, cqcRegistrationNo: e.target.value })} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="text" placeholder="Admin first name" value={form.adminFirstName} onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })} required />
            <input type="text" placeholder="Admin last name" value={form.adminLastName} onChange={(e) => setForm({ ...form, adminLastName: e.target.value })} required />
          </div>
          <input type="email" placeholder="Admin email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />

          {error && (
            <div style={{ background: 'var(--color-critical-soft)', color: 'var(--color-critical)', padding: '10px 12px', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Registering…' : 'Register company'}</button>
        </form>

        <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
          <div className="label-eyebrow" style={{ marginBottom: 14 }}>All companies</div>
          {companies.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No companies registered yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 6px' }}>Company</th>
                  <th style={{ padding: '8px 6px' }}>Registration ID</th>
                  <th style={{ padding: '8px 6px' }}>Admin</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 6px' }}>{c.name}</td>
                    <td style={{ padding: '10px 6px', fontFamily: 'monospace' }}>{c.registration_id}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{c.admin_email || '—'}</td>
                    <td style={{ padding: '10px 6px' }}>
                      <span className={`status-dot status-${c.is_active ? 'ok' : 'critical'}`} /> {c.is_active ? 'Active' : 'Suspended'}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleToggleActive(c)}>
                        {c.is_active ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function CredentialRow({ label, value, onCopy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 6 }}>
      <div>
        <span style={{ color: 'var(--color-ink-soft)', fontSize: 12 }}>{label}: </span>
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
      </div>
      <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => onCopy(value)}>
        Copy
      </button>
    </div>
  );
}
