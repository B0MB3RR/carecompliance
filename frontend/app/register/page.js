'use client';

import Link from 'next/link';

export default function RegisterInfoPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        padding: '40px 20px',
      }}
    >
      <div className="card" style={{ width: 480, maxWidth: '90vw', padding: 36, textAlign: 'center' }}>
        <div className="label-eyebrow" style={{ marginBottom: 6 }}>CareCompliance Intelligence</div>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Accounts are set up for you</h1>
        <p style={{ fontSize: 14, color: 'var(--color-ink-soft)', lineHeight: 1.6, marginBottom: 24 }}>
          There's no self-service sign-up for CareCompliance Intelligence. To get your organisation set up,
          contact your CareCompliance Intelligence account manager — they'll register your company and send you
          a company registration ID plus your first login. Once you're in, your company admin can add the rest
          of your team from Administration → Users.
        </p>
        <Link href="/login" className="btn-primary" style={{ display: 'inline-block' }}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
