import { goto } from '$app/navigation';

// Use VITE_API_URL when set (e.g. backend on separate Vercel project); otherwise same-origin /api
const BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '/api';
const FETCH_TIMEOUT_MS = 30000;

function getToken() {
  const session = localStorage.getItem('session');
  if (!session) return null;
  try {
    return JSON.parse(session).access_token;
  } catch {
    return null;
  }
}

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetchWithTimeout(`${BASE}${path}`, { ...options, headers });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      try {
        const retry = await fetchWithTimeout(`${BASE}${path}`, { ...options, headers });
        if (!retry.ok) {
          const err = await retry.json().catch(() => ({ error: 'Request failed' }));
          throw new Error(err.error);
        }
        return retry;
      } catch (retryErr) {
        if (retryErr.name === 'AbortError') throw new Error('Request timed out');
        throw retryErr;
      }
    }
    localStorage.removeItem('session');
    goto('/login');
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error);
  }

  return res;
}

async function tryRefresh() {
  const session = localStorage.getItem('session');
  if (!session) return false;

  try {
    const { refresh_token } = JSON.parse(session);
    if (!refresh_token) return false;

    const res = await fetchWithTimeout(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token })
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem('session', JSON.stringify(data.session));
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (path) => request(path).then(r => r.json()),

  post: (path, body) => request(path, {
    method: 'POST',
    body: JSON.stringify(body)
  }).then(r => r.json()),

  put: (path, body) => request(path, {
    method: 'PUT',
    body: JSON.stringify(body)
  }).then(r => r.json()),

  del: (path) => request(path, { method: 'DELETE' }).then(r => r.json()),

  getBlob: (path) => request(path).then(r => r.blob()),
};
