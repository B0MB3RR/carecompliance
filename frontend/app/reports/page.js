'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [reportType, setReportType] = useState('Monthly Compliance Summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  async function loadReports() {
    try {
      const data = await api.get('/reports');
      setReports(data.reports);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadReports();
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setFrom(firstOfMonth.toISOString().split('T')[0]);
    setTo(today.toISOString().split('T')[0]);
  }, []);

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError('');
    try {
      await api.post('/reports', { reportType, from, to });
      await loadReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 28 }}>
        <div className="label-eyebrow">Reporting</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Reports</h1>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      <div className="split-grid">
        <form onSubmit={handleGenerate} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Generate a report</div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Report type</label>
            <input type="text" value={reportType} onChange={(e) => setReportType(e.target.value)} required />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>

          <button type="submit" className="btn-primary" disabled={generating}>
            {generating ? 'Generating…' : 'Generate PDF report'}
          </button>
        </form>

        <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
          <div className="label-eyebrow" style={{ marginBottom: 14 }}>Report history</div>
          {reports.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No reports generated yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 6px' }}>Type</th>
                  <th style={{ padding: '8px 6px' }}>Period</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 6px' }}>{r.report_type}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>
                      {r.parameters?.from} → {r.parameters?.to}
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span className={`status-dot status-${r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'critical' : 'warning'}`} />{' '}
                      {r.status}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                      {r.status === 'completed' && (
                        <a href={`${process.env.NEXT_PUBLIC_API_URL}/reports/${r.id}/download`} className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}>
                          Download PDF
                        </a>
                      )}
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
