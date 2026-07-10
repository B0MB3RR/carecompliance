'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';

export default function SetPasswordPage() {
  const { user, loading, completePasswordChange } = useAuth();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    // Not logged in at all - send back to sign in. Logged in but this flag
    // is already false - nothing forcing them here, so send to dashboard.
    if (!user) router.replace('/login');
    else if (!user.mustChangePassword) router.replace('/dashboard');
  }, [loading, user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordChange(newPassword);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user || !user.mustChangePassword) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: '40px 20px' }}>
      <div className="card" style={{ width: 420, maxWidth: '90vw', padding: 36 }}>
        <div className="label-eyebrow" style={{ marginBottom: 6 }}>One more step</div>
        <h1 style={{ fontSize: 24, marginBottom: 10 }}>Set your password</h1>
        <p style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginBottom: 20, lineHeight: 1.5 }}>
          You signed in with a temporary password issued by your account admin. Choose a new one to continue —
          you won't be able to use the rest of the platform until this is done.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
            <div style={{ fontSize: 12, color: 'var(--color-ink-soft)', marginTop: 4 }}>At least 10 characters.</div>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} required />
          </div>

          {error && (
            <div style={{ background: 'var(--color-critical-soft)', color: 'var(--color-critical)', padding: '10px 12px', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
