import { supabaseAdmin } from '../services/supabase.js';

const AUTH_CACHE_TTL_MS = 30_000;
const MAX_AUTH_CACHE_SIZE = 100;
const authCache = new Map();

function getCachedAuth(token) {
  const cached = authCache.get(token);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    authCache.delete(token);
    return null;
  }

  return cached.user;
}

function setCachedAuth(token, user) {
  if (authCache.size >= MAX_AUTH_CACHE_SIZE) {
    const oldest = authCache.keys().next().value;
    authCache.delete(oldest);
  }

  authCache.set(token, {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS
  });
}

export function clearAuthCache(token) {
  if (token) authCache.delete(token);
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const cachedUser = getCachedAuth(token);
    if (cachedUser) {
      req.user = cachedUser;
      req.accessToken = token;
      return next();
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    setCachedAuth(token, user);
    req.user = user;
    req.accessToken = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
