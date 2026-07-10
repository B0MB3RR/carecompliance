const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function getTokens() {
  if (typeof window === 'undefined') return {};
  return {
    accessToken: localStorage.getItem('cc_access_token'),
    refreshToken: localStorage.getItem('cc_refresh_token'),
  };
}

function setTokens({ accessToken, refreshToken }) {
  if (typeof window === 'undefined') return;
  if (accessToken) localStorage.setItem('cc_access_token', accessToken);
  if (refreshToken) localStorage.setItem('cc_refresh_token', refreshToken);
}

function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('cc_access_token');
  localStorage.removeItem('cc_refresh_token');
  localStorage.removeItem('cc_user');
}

/**
 * Core request helper. Automatically attaches the access token and retries
 * once with a refreshed token if the API returns 401.
 */
async function request(path, { method = 'GET', body, isForm = false, retry = true } = {}) {
  const { accessToken } = getTokens();
  const headers = {};
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request(path, { method, body, isForm, retry: false });
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed with status ${res.status}`);
  }
  return data;
}

async function tryRefreshToken() {
  const { refreshToken } = getTokens();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens({ accessToken: data.accessToken });
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData, isForm: true }),
  setTokens,
  getTokens,
  clearTokens,
};
