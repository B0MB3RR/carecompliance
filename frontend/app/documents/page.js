'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [file, setFile] = useState(null);
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  async function loadDocuments(searchTerm = '') {
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const data = await api.get(`/documents${query}`);
      setDocuments(data.documents);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadDocuments();
    api.get('/documents/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return setError('Please choose a file to upload.');
    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    if (categoryId) formData.append('categoryId', categoryId);
    if (description) formData.append('description', description);
    if (expiryDate) formData.append('expiryDate', expiryDate);

    try {
      await api.postForm('/documents', formData);
      setFile(null);
      setDescription('');
      setExpiryDate('');
      await loadDocuments(search);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await api.delete(`/documents/${id}`);
      setDocuments((docs) => docs.filter((d) => d.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  return (
    <AppShell>
      <div style={{ marginBottom: 28 }}>
        <div className="label-eyebrow">Compliance records</div>
        <h1 style={{ fontSize: 30, marginTop: 4 }}>Documents</h1>
      </div>

      {error && <div style={{ color: 'var(--color-critical)', marginBottom: 16 }}>{error}</div>}

      <div className="split-grid">
        <form onSubmit={handleUpload} className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label-eyebrow">Upload document</div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>File</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Description</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Expiry date (optional)</label>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>

        <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadDocuments(search)}
            />
            <button className="btn-secondary" onClick={() => loadDocuments(search)}>Search</button>
          </div>

          {documents.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--color-ink-soft)' }}>No documents found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th style={{ padding: '8px 6px' }}>Size</th>
                  <th style={{ padding: '8px 6px' }}>Expiry</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 6px' }}>{doc.original_name}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>{formatSize(doc.size_bytes)}</td>
                    <td style={{ padding: '10px 6px', color: 'var(--color-ink-soft)' }}>
                      {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td style={{ padding: '10px 6px', textAlign: 'right' }}>
                      <a href={`${process.env.NEXT_PUBLIC_API_URL}/documents/${doc.id}/download`} className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px', marginRight: 6 }}>
                        Download
                      </a>
                      <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => handleDelete(doc.id)}>
                        Delete
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
