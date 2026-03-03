import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let _admin = null;

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  if (!_admin) {
    _admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

export const supabaseAdmin = new Proxy({}, {
  get(_, prop) {
    return getAdmin()[prop];
  }
});

const _userClients = new Map();
const MAX_CACHED_CLIENTS = 50;

export function createUserClient(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase not configured');

  if (_userClients.has(accessToken)) {
    return _userClients.get(accessToken);
  }

  if (_userClients.size >= MAX_CACHED_CLIENTS) {
    const oldest = _userClients.keys().next().value;
    _userClients.delete(oldest);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
  _userClients.set(accessToken, client);
  return client;
}
