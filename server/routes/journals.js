import { Router } from 'express';
import { supabaseAdmin, createUserClient } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { validateJournalEntry, validateFinishDay, validateHours, validateDateParam } from '../middleware/validation.js';

const router = Router();
router.use(requireAuth);

const MAX_JOURNAL_LIST = 1000;

function userDb(req) {
  return createUserClient(req.accessToken);
}

router.get('/', async (req, res) => {
  try {
    const { year, month } = req.query;
    const userId = req.user.id;
    let query = supabaseAdmin
      .from('journals')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0)
        .toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }
    query = query.limit(MAX_JOURNAL_LIST);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Fetch journals error:', err);
    res.status(500).json({ error: 'Failed to fetch journals' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('journals')
      .select('date, hours, status, content_raw, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('date', { ascending: true })
      .limit(MAX_JOURNAL_LIST);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Export journals error:', err);
    res.status(500).json({ error: 'Failed to export journals' });
  }
});

router.get('/:date', validateDateParam, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('journals')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('date', req.params.date)
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Fetch journal error:', err);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

router.post('/', validateJournalEntry, async (req, res) => {
  const { date, hours, content_raw } = req.body;

  try {
    const { data: existing } = await supabaseAdmin
      .from('journals')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('date', date)
      .maybeSingle();

    if (existing?.status === 'finished') {
      return res.status(403).json({ error: 'Cannot edit a finished journal entry' });
    }

    const { data: progress } = await supabaseAdmin
      .from('internship_progress')
      .select('is_completed')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (progress?.is_completed) {
      return res.status(403).json({ error: 'Internship hours completed. No new entries allowed.' });
    }

    if (existing) {
      const updates = {};
      if (hours !== undefined) updates.hours = parseFloat(hours);
      if (content_raw !== undefined) updates.content_raw = content_raw;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await userDb(req)
        .from('journals')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await userDb(req)
        .from('journals')
        .insert({
          user_id: req.user.id,
          date,
          hours: parseFloat(hours) || 0,
          content_raw: content_raw || '',
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    }
  } catch (err) {
    console.error('Save journal error:', err);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

router.post('/log-hours', validateHours, async (req, res) => {
  const { date, hours } = req.body;

  try {
    const { data: existing } = await supabaseAdmin
      .from('journals')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('date', date)
      .maybeSingle();

    if (existing?.status === 'finished') {
      return res.status(403).json({ error: 'Cannot modify hours for a finished day' });
    }

    if (existing) {
      const { data, error } = await userDb(req)
        .from('journals')
        .update({ hours: parseFloat(hours), updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await userDb(req)
        .from('journals')
        .insert({
          user_id: req.user.id,
          date,
          hours: parseFloat(hours),
          content_raw: '',
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    }
  } catch (err) {
    console.error('Log hours error:', err);
    res.status(500).json({ error: 'Failed to log hours' });
  }
});

router.post('/finish-day', validateFinishDay, async (req, res) => {
  const { date } = req.body;

  try {
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from('journals')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('date', date)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (!entry) {
      return res.status(404).json({ error: 'No journal entry found for this date' });
    }

    if (entry.status === 'finished') {
      return res.status(400).json({ error: 'Day already finished' });
    }

    if (!entry.hours || entry.hours <= 0) {
      return res.status(400).json({ error: 'Cannot finish day without logging hours' });
    }

    const { data: rows, error } = await supabaseAdmin.rpc('finish_journal_day', {
      p_journal_id: entry.id,
      p_user_id: req.user.id
    });

    if (error) throw error;
    const data = Array.isArray(rows) ? rows[0] : rows;
    if (!data) {
      return res.status(400).json({ error: 'Day already finished or not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('Finish day error:', err);
    res.status(500).json({ error: 'Failed to finish day' });
  }
});

export default router;
