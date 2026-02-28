/**
 * Smoke test: GET /api/health. Run with server up (e.g. in CI after deploy).
 * Exit 0 if status is ok or degraded; 1 otherwise.
 */
const base = process.env.API_BASE_URL || 'http://localhost:3001';

fetch(`${base}/api/health`)
  .then((r) => r.json())
  .then((body) => {
    if (body.status === 'ok' || body.status === 'degraded') process.exit(0);
    process.exit(1);
  })
  .catch(() => process.exit(1));
