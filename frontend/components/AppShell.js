'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { api } from '../lib/api';

const TENANT_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Compliance Calendar' },
  { href: '/staff', label: 'Staff & Training' },
  { href: '/cqc-readiness', label: 'CQC Readiness' },
  { href: '/incidents', label: 'Incidents' },
  { href: '/documents', label: 'Documents' },
  { href: '/operational-data', label: 'Operational Data' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Administration' },
];

const PLATFORM_NAV_ITEMS = [
  { href: '/internal-onboarding', label: 'Company Onboarding' },
];

const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/api$/, '');

export default function AppShell({ children }) {
  const { user, loading, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [hasLogo, setHasLogo] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    else if (!loading && user?.mustChangePassword) router.replace('/set-password');
    else if (!loading && user?.role === 'super_admin' && !pathname?.startsWith('/internal-onboarding')) {
      router.replace('/internal-onboarding');
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    if (!user?.companyId) return;
    // Cheap existence probe - the <img> below points at the same URL and
    // will simply not render if this 404s, but this lets us swap back to
    // the text wordmark instead of leaving a broken image icon. Re-runs on
    // route change too, so uploading a logo from Admin shows up in the
    // sidebar as soon as you navigate away, not just after a hard refresh.
    api.get(`/company`).then((d) => setHasLogo(Boolean(d.company?.logo_storage_path))).catch(() => {});
  }, [user?.companyId, pathname]);

  // Global unread-alerts count, available from every screen (not just the
  // dashboard), so nothing urgent gets missed while working elsewhere.
  useEffect(() => {
    if (!user?.companyId) return;
    let cancelled = false;
    function poll() {
      api.get('/dashboard/summary').then((d) => {
        if (!cancelled) setUnreadCount(d.unreadAlertsCount || 0);
      }).catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.companyId]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (loading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="label-eyebrow">Loading…</span>
      </div>
    );
  }

  const navItems = user.role === 'super_admin' ? PLATFORM_NAV_ITEMS : TENANT_NAV_ITEMS;
  const activeLabel = navItems.find((item) => pathname?.startsWith(item.href))?.label || 'CareCompliance';

  return (
    <div className="app-shell">
      <div className="mobile-topbar">
        <button
          aria-label="Open menu"
          onClick={() => setSidebarOpen(true)}
          style={{ background: 'transparent', color: '#fff', fontSize: 20, padding: '4px 8px' }}
        >
          ☰
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16 }}>{activeLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            aria-label="Toggle theme"
            onClick={toggleTheme}
            style={{ background: 'transparent', color: '#fff', fontSize: 16, padding: '4px 6px' }}
          >
            {isDark ? '☀' : '●'}
          </button>
          <Link href="/dashboard" style={{ position: 'relative', color: '#fff', fontSize: 18, padding: '4px 8px' }} aria-label="Alerts">
            🔔
            {unreadCount > 0 && <NotificationDot count={unreadCount} />}
          </Link>
        </div>
      </div>

      <div className={`sidebar-scrim ${sidebarOpen ? 'is-open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`app-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div>
          {hasLogo && user?.companyId ? (
            <img
              src={`${API_ROOT}/api/branding/${user.companyId}/logo`}
              alt={`${user.companyName || 'Company'} logo`}
              style={{ maxWidth: 160, maxHeight: 48, marginBottom: 8, borderRadius: 4, background: 'var(--color-surface)', padding: 4 }}
            />
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>
                CareCompliance
              </div>
              <div style={{ fontSize: 12, color: '#9fb0c9', marginTop: 2 }}>Intelligence</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                aria-label="Toggle light/dark theme"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleTheme}
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, padding: '6px 8px', borderRadius: 6 }}
              >
                {isDark ? '☀' : '●'}
              </button>
              <div style={{ position: 'relative', fontSize: 18 }}>
                🔔
                {unreadCount > 0 && <NotificationDot count={unreadCount} />}
              </div>
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {navItems.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: active ? '#fff' : '#c3cee0',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {user.firstName} {user.lastName}
          </div>
          <div style={{ fontSize: 12, color: '#9fb0c9', marginBottom: 12 }}>{user.role?.replace('_', ' ')}</div>
          <button className="btn-secondary" style={{ width: '100%', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}

function NotificationDot({ count }) {
  return (
    <span
      style={{
        position: 'absolute',
        top: -4,
        right: -6,
        minWidth: 15,
        height: 15,
        padding: '0 3px',
        borderRadius: 8,
        background: 'var(--color-critical)',
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
