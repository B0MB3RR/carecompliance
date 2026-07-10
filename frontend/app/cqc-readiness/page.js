'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

const KLOES = [
  { value: 'safe', label: 'Safe' },
  { value: 'effective', label: 'Effective' },
  { value: 'caring', label: 'Caring' },
  { value: 'responsive', label: 'Responsive' },
  { value: 'well_led', label: 'Well-led' },
];

function scoreColor(score) {
  if (score >= 70) return 'ok';
  if (score >= 40) return 'warning';
  return 'critical';
}

export default function CqcReadinessPage() {
  const [readiness, setReadiness] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState('');
  const [activeKloe, setActiveKloe] = useState('safe');

  async function loadAll() {
    try {
      const [readinessData, evidenceData, actionsData] = await Promise.all([
        api.get('/cqc/readiness-score'),
        api.get('/cqc/evidence'),
        api.get('/cqc/actions'),
      ]);
      setReadiness(readinessData);
      setEvidence(evidenceData.evidence);
      setActions(actionsData.actionItems);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <AppShell>
      <div style={{ marginBottom: 24 }}>
        <div className="label-eyebrow">Inspection readiness</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>CQC Readiness</h1>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      {readiness && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
            <div>
              <div className="label-eyebrow">Overall readiness</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 600 }}>{readiness.overallScore}%</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', maxWidth: 420 }}>
              Calculated from the share of evidence marked "ready" per Key Line of Enquiry, minus a penalty for open and overdue action items. Transparent by design — click into a KLOE below to see exactly why it scores the way it does.
            </div>
          </div>

          <div className="kpi-grid">
            {readiness.kloeScores.map((k) => (
              <button
                key={k.kloe}
                onClick={() => setActiveKloe(k.kloe)}
                style={{
                  padding: 14,
                  borderRadius: 8,
                  textAlign: 'left',
                  background: activeKloe === k.kloe ? 'var(--color-ink)' : 'var(--color-surface-subtle)',
                  color: activeKloe === k.kloe ? 'var(--color-bg)' : 'var(--color-ink)',
                  border: 'none',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{KLOES.find((x) => x.value === k.kloe)?.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{k.score}%</span>
                  <span className={`status-dot status-${scoreColor(k.score)}`} />
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  {k.readyEvidence}/{k.totalEvidence} ready · {k.openActions} open action{k.openActions === 1 ? '' : 's'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel-grid-2">
        <EvidencePanel kloe={activeKloe} evidence={evidence.filter((e) => e.kloe === activeKloe)} onChanged={loadAll} />
        <ActionPlanPanel kloe={activeKloe} actions={actions.filter((a) => a.kloe === activeKloe)} onChanged={loadAll} />
      </div>
    </AppShell>
  );
}

function EvidencePanel({ kloe, evidence, onChanged }) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    try {
      await api.post('/cqc/evidence', { kloe, title });
      setTitle('');
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function cycleStatus(item) {
    const next = { not_started: 'in_progress', in_progress: 'ready', ready: 'not_started' }[item.status];
    await api.patch(`/cqc/evidence/${item.id}`, { status: next });
    await onChanged();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-eyebrow" style={{ marginBottom: 14 }}>
        Evidence checklist — {KLOES.find((k) => k.value === kloe)?.label}
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" placeholder="Add an evidence item…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn-secondary" disabled={submitting}>Add</button>
      </form>

      {evidence.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No evidence items yet for this KLOE.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {evidence.map((item) => (
            <button
              key={item.id}
              onClick={() => cycleStatus(item)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                background: item.status === 'ready' ? 'var(--color-accent-soft)' : item.status === 'in_progress' ? 'var(--color-warning-soft)' : 'var(--color-surface-subtle)',
                textAlign: 'left',
              }}
              title="Click to advance status"
            >
              <span style={{ fontSize: 13 }}>{item.title}</span>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-ink-soft)' }}>
                {item.status.replace('_', ' ')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionPlanPanel({ kloe, actions, onChanged }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    try {
      await api.post('/cqc/actions', { kloe, title, priority, dueDate: dueDate || undefined });
      setTitle('');
      setDueDate('');
      await onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function advanceStatus(item) {
    const next = { open: 'in_progress', in_progress: 'completed', completed: 'open' }[item.status];
    await api.patch(`/cqc/actions/${item.id}`, { status: next });
    await onChanged();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-eyebrow" style={{ marginBottom: 14 }}>
        Action plan — {KLOES.find((k) => k.value === kloe)?.label}
      </div>

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <input type="text" placeholder="What needs to happen?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ flex: 1 }}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ flex: 1 }} />
        </div>
        <button type="submit" className="btn-secondary" disabled={submitting}>Add action</button>
      </form>

      {actions.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No action items for this KLOE.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((item) => {
            const overdue = item.due_date && item.status !== 'completed' && new Date(item.due_date) < new Date();
            return (
              <button
                key={item.id}
                onClick={() => advanceStatus(item)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: item.status === 'completed' ? 'var(--color-accent-soft)' : overdue ? 'var(--color-critical-soft)' : 'var(--color-surface-subtle)',
                  textAlign: 'left',
                }}
                title="Click to advance status"
              >
                <div>
                  <div style={{ fontSize: 13 }}>{item.title}</div>
                  {item.due_date && (
                    <div style={{ fontSize: 11, color: overdue ? 'var(--color-critical)' : 'var(--color-ink-soft)' }}>
                      Due {new Date(item.due_date).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-ink-soft)' }}>
                  {item.status.replace('_', ' ')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
