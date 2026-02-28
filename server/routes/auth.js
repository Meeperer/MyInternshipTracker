import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, full_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (typeof email !== 'string' || email.trim().length > 254) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const trimmedName = (full_name || '').trim();
  if (trimmedName && trimmedName.length > 200) {
    return res.status(400).json({ error: 'Name is too long (max 200 characters)' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: trimmedName || undefined }
    });

    if (error) {
      return res.status(400).json({ error: 'Registration failed. Email may already be in use.' });
    }

    if (trimmedName) {
      await supabaseAdmin
        .from('profiles')
        .update({ full_name: trimmedName })
        .eq('id', data.user.id);
    }

    res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Registration error:', err?.message ?? 'Unknown error');
    } else {
      console.error('Registration error:', err);
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Login error:', err?.message ?? 'Unknown error');
    } else {
      console.error('Login error:', err);
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts. Please try again later.' }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });

    if (error) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Refresh error:', err?.message ?? 'Unknown error');
    } else {
      console.error('Refresh error:', err);
    }
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

router.post('/logout', requireAuth, async (_req, res) => {
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(data);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Profile fetch error:', err?.message ?? 'Unknown error');
    } else {
      console.error('Profile fetch error:', err);
    }
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
