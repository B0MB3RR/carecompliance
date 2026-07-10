'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

const TYPE_LABELS = {
  dbs: 'DBS check',
  training: 'Training',
  supervision: 'Supervision',
  cqc_action: 'CQC action',
  document: 'Document',
};

const TYPE_ICONS = {
  dbs: '🛡',
  training: '🎓',
  supervision: '🗣',
  cqc_action: '📋',
  document: '📄',
};

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function CalendarPage() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [windowDays, setWindowDays] = useState(120);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    api.get(`/dashboard/calendar?days=${windowDays}`)
      .then((d) => setEvents(d.events))
      .catch((err) => setError(err.message));
  }, [windowDays]);

  const filtered = events ? events.filter((e) => typeFilter === 'all' || e.type === typeFilter) : [];

  // Group into month buckets, in chronological order.
  const groups = [];
  filtered.forEach((e) => {
    const key = monthKey(e.dueDate);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, events: [] };
      groups.push(group);
    }
    group.events.push(e);
  });

  const overdueCount = filtered.filter((e) => e.isOverdue).length;

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Forward planning</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Compliance Calendar</h1>
        <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', marginTop: 6 }}>
          Every upcoming deadline across staff, CQC actions, and documents, in one place — DBS renewals, training expiries, supervision due dates, CQC action deadlines, and document expiries.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={30}>Next 30 days</option>
          <option value={60}>Next 60 days</option>
          <option value={120}>Next 4 months</option>
          <option value={365}>Next 12 months</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {overdueCount > 0 && (
          <span style={{ fontSize: 12, color: 'var(--color-critical)', fontWeight: 600 }}>
            {overdueCount} overdue
          </span>
        )}
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      {!events ? (
        <div className="label-eyebrow">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 24, fontSize: 14, color: 'var(--color-ink-soft)' }}>
          Nothing due in this window — you're clear. Widen the date range above to plan further ahead.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groups.map((group) => (
            <div key={group.key}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
                {group.key}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {group.events.map((e, i) => (
                  <div
                    key={`${e.type}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 18px',
                      borderBottom: i < group.events.length - 1 ? '1px solid var(--color-border)' : 'none',
                      background: e.isOverdue ? 'var(--color-critical-soft)' : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{TYPE_ICONS[e.type]}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-ink-soft)' }}>{TYPE_LABELS[e.type]}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: e.isOverdue ? 'var(--color-critical)' : 'var(--color-ink)' }}>
                        {new Date(e.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </div>
                      {e.isOverdue && <div style={{ fontSize: 11, color: 'var(--color-critical)' }}>Overdue</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
