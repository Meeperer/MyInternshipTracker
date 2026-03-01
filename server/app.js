import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/auth.js';
import journalRoutes from './routes/journals.js';
import progressRoutes from './routes/progress.js';
import aiRoutes from './routes/ai.js';
import compilationRoutes from './routes/compilation.js';
import eventRoutes from './routes/events.js';
import { supabaseAdmin } from './services/supabase.js';

const app = express();
const isDev = process.env.NODE_ENV !== 'production';

app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

if (isDev) {
  app.use(morgan('dev'));
}

app.use('/api/auth', authRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/compilation', compilationRoutes);
app.use('/api/events', eventRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    res.json({
      status: error ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      supabase: error ? 'unreachable' : 'connected'
    });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), supabase: 'unreachable' });
  }
});

app.use((err, _req, res, _next) => {
  if (isDev) {
    console.error('Unhandled error:', err);
  } else {
    console.error('Unhandled error:', err?.message ?? 'Unknown error');
  }
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error'
  });
});

export default app;
