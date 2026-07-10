'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useTheme } from '../../lib/theme-context';

function metricStatus(metric) {
  if (metric.recorded_value == null || metric.target_value == null) return 'ok';
  const value = Number(metric.recorded_value);
  const target = Number(metric.target_value);
  const onTarget = metric.direction === 'higher_better' ? value >= target : value <= target;
  if (onTarget) return 'ok';
  const distance = Math.abs(value - target) / (target || 1);
  return distance > 0.25 ? 'critical' : 'warning';
}

const KLOE_LABELS = { safe: 'Safe', effective: 'Effective', caring: 'Caring', responsive: 'Responsive', well_led: 'Well-led' };
const SEVERITY_COLORS = { low: '#2f6f62', medium: '#b4791f', high: '#c9863a', critical: '#a23b32' };

// Two small palettes so the panel grid can flip into a "control room" dark
// mode - the Grafana-style aesthetic - without touching the rest of the app.
const LIGHT = {
  pageBg: 'transparent', panelBg: '#ffffff', panelBorder: '#e3ded2',
  text: '#16233d', textSoft: '#57667e', grid: '#e3ded2', accent: '#2f6f62',
};
const DARK = {
  pageBg: '#0f1526', panelBg: '#161d33', panelBorder: '#262f4a',
  text: '#e7ecf7', textSoft: '#8b96b8', grid: '#262f4a', accent: '#4fd1a5',
};

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const { isDark: dark } = useTheme();

  const t = dark ? DARK : LIGHT;

  useEffect(() => {
    api.get('/dashboard/summary').then(setSummary).catch((err) => setError(err.message));
    api.get('/dashboard/analytics').then(setAnalytics).catch(() => {});
  }, []);

  async function handleMarkRead(alertId) {
    await api.patch(`/dashboard/alerts/${alertId}/read`);
    setSummary((s) => ({
      ...s,
      recentAlerts: s.recentAlerts.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)),
      unreadAlertsCount: Math.max(0, s.unreadAlertsCount - 1),
    }));
  }

  const complianceAlerts = summary ? [
    ...summary.complianceAlerts.expiringDbs.map((s) => ({ key: `dbs-${s.id}`, severity: 'warning', text: `DBS check for ${s.first_name} ${s.last_name} expires ${new Date(s.dbs_expiry_date).toLocaleDateString('en-GB')}` })),
    ...summary.complianceAlerts.expiringTraining.map((tr) => ({ key: `training-${tr.id}`, severity: 'warning', text: `${tr.course_name} for ${tr.first_name} ${tr.last_name} expires ${new Date(tr.expiry_date).toLocaleDateString('en-GB')}` })),
    ...summary.complianceAlerts.staffOverdueSupervision.map((s) => ({ key: `sup-${s.id}`, severity: 'warning', text: `${s.first_name} ${s.last_name} has no upcoming supervision scheduled` })),
    ...summary.complianceAlerts.overdueCqcActions.map((a) => ({ key: `action-${a.id}`, severity: 'critical', text: `CQC action overdue: "${a.title}" (${a.kloe.replace('_', '-')})` })),
  ] : [];

  // Reshape incidentsByMonth (long format: month/severity/count) into a
  // wide format recharts can stack: [{ month, low, medium, high, critical }]
  const incidentChartData = [];
  if (analytics) {
    const byMonth = {};
    analytics.incidentsByMonth.forEach((row) => {
      byMonth[row.month] = byMonth[row.month] || { month: row.month };
      byMonth[row.month][row.severity] = row.count;
    });
    Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .forEach((row) => incidentChartData.push(row));
  }

  const radarData = analytics
    ? analytics.readinessByKloe.map((r) => ({ kloe: KLOE_LABELS[r.kloe], score: r.score }))
    : [];

  return (
    <AppShell>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="label-eyebrow">Overview</div>
          <h1 style={{ fontSize: 26, marginTop: 2 }}>Dashboard</h1>
        </div>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 20 }}>{error}</div>}

      {!summary ? (
        <div className="label-eyebrow">Loading dashboard…</div>
      ) : (
        <div
          className="dashboard-viewport"
          style={{ background: t.pageBg, padding: dark ? 16 : 0, borderRadius: 12, transition: 'background 0.15s ease' }}
        >
          {/* Signature element: Compliance Pulse - condensed to a single
              compact strip, hover a segment for its detail rather than a
              full legend row, to keep this from eating vertical space. */}
          <Panel t={t} title="Compliance Pulse" compact>
            {summary.metrics.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textSoft }}>No operational metrics recorded yet — add records from Operational Data to see your pulse here.</div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {summary.metrics.map((m) => {
                  const status = metricStatus(m);
                  const color = status === 'ok' ? t.accent : status === 'warning' ? '#b4791f' : '#a23b32';
                  return (
                    <div
                      key={m.id}
                      title={`${m.display_name}: ${m.recorded_value ?? '—'} ${m.unit || ''}`}
                      style={{ flex: 1, height: 14, borderRadius: 4, background: color, cursor: 'default' }}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Stat panels */}
          <div className="kpi-grid">
            <StatPanel t={t} icon="📄" label="Documents on file" value={summary.documentsCount} />
            <StatPanel t={t} icon="🧑‍🤝‍🧑" label="Active staff" value={summary.activeStaffCount} />
            <StatPanel t={t} icon="⚠️" label="Open incidents" value={summary.openIncidentsCount} accent={summary.openIncidentsCount > 0 ? 'warning' : 'ok'} />
            <StatPanel t={t} icon="🛡" label="CQC evidence ready" value={`${summary.cqcEvidenceReadinessPct}%`} accent={summary.cqcEvidenceReadinessPct >= 70 ? 'ok' : summary.cqcEvidenceReadinessPct >= 40 ? 'warning' : 'critical'} />
            <StatPanel t={t} icon="🔔" label="Unread alerts" value={summary.unreadAlertsCount} accent={summary.unreadAlertsCount > 0 ? 'warning' : 'ok'} />
          </div>

          {/* Three analytics panels, side by side, sized to fill whatever
              vertical room is left rather than stacking with fixed heights. */}
          <div className="dashboard-charts-row">
            <Panel t={t} title="Incidents — last 6 months" fill>
              {!analytics || incidentChartData.length === 0 ? (
                <EmptyChartNote t={t} text="No incidents logged in the last 6 months." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incidentChartData}>
                    <defs>
                      {['low', 'medium', 'high', 'critical'].map((sev) => (
                        <linearGradient key={sev} id={`grad-${sev}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SEVERITY_COLORS[sev]} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={SEVERITY_COLORS[sev]} stopOpacity={0.6} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                    <XAxis dataKey="month" stroke={t.textSoft} fontSize={11} />
                    <YAxis stroke={t.textSoft} fontSize={11} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={{ background: t.panelBg, border: `1px solid ${t.panelBorder}`, color: t.text, fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11, color: t.textSoft }} />
                    {['low', 'medium', 'high', 'critical'].map((sev) => (
                      <Bar key={sev} dataKey={sev} stackId="a" fill={`url(#grad-${sev})`} name={sev} radius={sev === 'critical' ? [3, 3, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel t={t} title="CQC readiness" fill>
              {!analytics ? (
                <EmptyChartNote t={t} text="Loading…" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <defs>
                      <linearGradient id="grad-radar" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={t.accent} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={t.accent} stopOpacity={0.15} />
                      </linearGradient>
                    </defs>
                    <PolarGrid stroke={t.grid} />
                    <PolarAngleAxis dataKey="kloe" stroke={t.textSoft} fontSize={11} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke={t.textSoft} fontSize={9} />
                    <Radar dataKey="score" stroke={t.accent} strokeWidth={2} fill="url(#grad-radar)" />
                    <Tooltip contentStyle={{ background: t.panelBg, border: `1px solid ${t.panelBorder}`, color: t.text, fontSize: 12, borderRadius: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel t={t} title="Training compliance" fill>
              {!analytics || analytics.trainingByCourse.length === 0 ? (
                <EmptyChartNote t={t} text="No mandatory courses or staff configured yet." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.trainingByCourse} layout="vertical" margin={{ left: 8 }}>
                    <defs>
                      <linearGradient id="grad-training" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={t.accent} stopOpacity={0.55} />
                        <stop offset="100%" stopColor={t.accent} stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} stroke={t.textSoft} fontSize={11} unit="%" />
                    <YAxis type="category" dataKey="courseName" stroke={t.textSoft} fontSize={11} width={110} tick={{ width: 100 }} />
                    <Tooltip contentStyle={{ background: t.panelBg, border: `1px solid ${t.panelBorder}`, color: t.text, fontSize: 12, borderRadius: 8 }} formatter={(v) => `${v}%`} />
                    <Bar dataKey="compliancePct" name="Compliant" fill="url(#grad-training)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          {/* Needs attention + Recent alerts share a fixed-height row on
              desktop, each scrolling internally so a long list can't push
              the page into a scroll of its own. */}
          <div className="dashboard-bottom-row">
            <Panel t={t} title={`Needs attention${complianceAlerts.length > 0 ? ` (${complianceAlerts.length})` : ''}`} fill>
              {complianceAlerts.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSoft }}>Nothing needs attention right now.</div>
              ) : (
                <div className="scroll-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  {complianceAlerts.map((a) => <ComplianceRow key={a.key} t={t} severity={a.severity} text={a.text} />)}
                </div>
              )}
            </Panel>

            <Panel t={t} title="Recent alerts" fill>
              {summary.recentAlerts.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSoft }}>No alerts to show.</div>
              ) : (
                <div className="scroll-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                  {summary.recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: alert.is_read ? 'transparent' : (dark ? 'rgba(79,209,165,0.08)' : 'var(--color-accent-soft)'),
                        border: `1px solid ${t.panelBorder}`,
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span className={`status-dot status-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'ok'}`} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{alert.title}</span>
                        </div>
                        {alert.message && <div style={{ fontSize: 12, color: t.textSoft }}>{alert.message}</div>}
                      </div>
                      {!alert.is_read && (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0, marginLeft: 8 }} onClick={() => handleMarkRead(alert.id)}>
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Panel({ t, title, children, compact, fill }) {
  return (
    <div
      style={{
        background: t.panelBg,
        border: `1px solid ${t.panelBorder}`,
        borderRadius: 12,
        padding: compact ? '12px 16px' : 16,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        display: fill ? 'flex' : 'block',
        flexDirection: fill ? 'column' : undefined,
        minHeight: 0,
        height: fill ? '100%' : undefined,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: t.textSoft, marginBottom: compact ? 8 : 10, flexShrink: 0 }}>
        {title}
      </div>
      <div style={{ flex: fill ? 1 : undefined, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function StatPanel({ t, icon, label, value, accent = 'ok' }) {
  const color = accent === 'ok' ? t.accent : accent === 'warning' ? '#b4791f' : '#a23b32';
  return (
    <div
      className="stat-panel"
      style={{ background: t.panelBg, border: `1px solid ${t.panelBorder}`, borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, color: t.textSoft }}>{label}</span>
        <span style={{ fontSize: 14, opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: t.text }}>{value}</span>
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: color }} />
      </div>
    </div>
  );
}

function ComplianceRow({ t, severity, text }) {
  const bg = severity === 'critical' ? 'rgba(162,59,50,0.12)' : 'rgba(180,121,31,0.12)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: bg, flexShrink: 0 }}>
      <span className={`status-dot status-${severity}`} />
      <span style={{ fontSize: 12, color: t.text }}>{text}</span>
    </div>
  );
}

function EmptyChartNote({ t, text }) {
  return <div style={{ fontSize: 13, color: t.textSoft, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{text}</div>;
}
