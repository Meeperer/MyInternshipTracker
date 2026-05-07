/**
 * Smoke test: GET /api/health. Run with server up (e.g. in CI after deploy).
 * Exit 0 if status is ok or degraded; 1 otherwise.
 */
const base = process.env.API_BASE_URL || 'http://localhost:3001';

try {
  const response = await fetch(`${base}/api/health`);
  const body = await response.json();
  process.exitCode = body.status === 'ok' || body.status === 'degraded' ? 0 : 1;
} catch {
  process.exitCode = 1;
}
