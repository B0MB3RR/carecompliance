'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const [registrationId, setRegistrationId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password, isPlatformStaff ? undefined : registrationId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div className="card" style={{ width: 380, maxWidth: '90vw', padding: 36 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="label-eyebrow" style={{ marginBottom: 6 }}>CareCompliance Intelligence</div>
          <h1 style={{ fontSize: 26 }}>Sign in</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isPlatformStaff && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Company registration ID</label>
              <input
                type="text"
                placeholder="e.g. CCI-7K4QN2"
                value={registrationId}
                onChange={(e) => setRegistrationId(e.target.value.toUpperCase())}
                required
                style={{ textTransform: 'uppercase' }}
              />
              <div style={{ fontSize: 12, color: 'var(--color-ink-soft)', marginTop: 4 }}>
                Sent to you when your organisation was set up. Contact your account admin if you don't have it.
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && (
            <div style={{ background: 'var(--color-critical-soft)', color: 'var(--color-critical)', padding: '10px 12px', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, fontSize: 12, color: 'var(--color-ink-soft)' }}>
          <input
            type="checkbox"
            checked={isPlatformStaff}
            onChange={(e) => setIsPlatformStaff(e.target.checked)}
            style={{ width: 'auto' }}
          />
          I'm CareCompliance Intelligence platform staff (no registration ID)
        </label>

        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--color-ink-soft)' }}>
          New provider? Accounts are set up by CareCompliance Intelligence — contact your account manager to get started. There's no self-service sign-up.
        </div>
      </div>
    </div>
  );
}
