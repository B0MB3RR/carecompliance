'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

export default function OperationalDataPage() {
  const [metrics, setMetrics] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('');
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');

  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/operational/metrics').then((d) => {
      setMetrics(d.metrics);
      if (d.metrics.length > 0) setSelectedMetric(d.metrics[0].id);
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedMetric) return;
    api.get(`/operational/records?metricDefinitionId=${selectedMetric}`)
      .then((d) => setRecords(d.records.slice().reverse()))
      .catch((err) => setError(err.message));
  }, [selectedMetric]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedMetric || value === '') return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/operational/records', {
        metricDefinitionId: selectedMetric,
        recordedValue: Number(value),
        recordDate: date,
        notes: notes || undefined,
      });
      setValue('');
      setNotes('');
      const d = await api.get(`/operational/records?metricDefinitionId=${selectedMetric}`);
      setRecords(d.records.slice().reverse());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const chartData = records.map((r) => ({
    date: new Date(r.record_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    value: Number(r.recorded_value),
  }));

  return (
    <AppShell>
      <div style={{ marginBottom: 28 }}>
        <div className="label-eyebrow">Operational data</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Operational Data</h1>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      {metrics.length === 0 ? (
        <div className="card" style={{ padding: 24, fontSize: 14, color: 'var(--color-ink-soft)' }}>
          No metrics have been configured yet. Ask a company admin to add operational metrics from the API
          (<code>POST /api/operational/metrics</code>) - a metric configuration screen can be added here next.
        </div>
      ) : (
        <div className="split-grid">
          <form onSubmit={handleSubmit} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="label-eyebrow">Record a data point</div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Metric</label>
              <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}>
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Value</label>
              <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save record'}
            </button>
          </form>

          <div className="card" style={{ padding: 24, overflowX: 'auto' }}>
            <div className="label-eyebrow" style={{ marginBottom: 16 }}>Trend</div>
            {chartData.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No historical records for this metric yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-ink-soft)" fontSize={12} />
                  <YAxis stroke="var(--color-ink-soft)" fontSize={12} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-ink)', fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}

            <div className="label-eyebrow" style={{ marginTop: 24, marginBottom: 12 }}>History</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 6px' }}>Date</th>
                  <th style={{ padding: '8px 6px' }}>Value</th>
                  <th style={{ padding: '8px 6px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {records.slice().reverse().map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 6px' }}>{new Date(r.record_date).toLocaleDateString('en-GB')}</td>
                    <td style={{ padding: '10px 6px' }}>{r.recorded_value}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}
