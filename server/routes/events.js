import { Router } from 'express';
import { supabaseAdmin, createUserClient } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { validateEvent } from '../middleware/validation.js';

const router = Router();
router.use(requireAuth);

function userDb(req) {
  return createUserClient(req.accessToken);
}

router.get('/', async (req, res) => {
  try {
    const { date, month, year } = req.query;
    const userId = req.user.id;
    let query = supabaseAdmin
      .from('events')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });

    if (date) {
      query = query.eq('date', date);
    } else if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Fetch events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/', validateEvent, async (req, res) => {
  const { date, title, description, start_time, end_time, type, reminder_enabled } = req.body;
  const userId = req.user.id;

  try {
    const { data: journal } = await supabaseAdmin
      .from('journals')
      .select('status')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (journal?.status === 'finished') {
      return res.status(403).json({ error: 'Cannot add events to a finished day' });
    }

    const { data, error } = await userDb(req)
      .from('events')
      .insert({
        user_id: userId,
        date,
        title: title.trim(),
        description: (description || '').trim(),
        start_time: start_time || null,
        end_time: end_time || null,
        type: type || 'personal',
        reminder_enabled: !!reminder_enabled
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/:id', validateEvent, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { date, title, description, start_time, end_time, type, reminder_enabled } = req.body;

  try {
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { data: journal } = await supabaseAdmin
      .from('journals')
      .select('status')
      .eq('user_id', userId)
      .eq('date', date || existing.date)
      .maybeSingle();

    if (journal?.status === 'finished') {
      return res.status(403).json({ error: 'Cannot edit events on a finished day' });
    }

    const updates = {};
    if (date !== undefined) updates.date = date;
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (start_time !== undefined) updates.start_time = start_time || null;
    if (end_time !== undefined) updates.end_time = end_time || null;
    if (type !== undefined) updates.type = type;
    if (reminder_enabled !== undefined) updates.reminder_enabled = !!reminder_enabled;

    const { data, error } = await userDb(req)
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id, date')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { data: journal } = await supabaseAdmin
      .from('journals')
      .select('status')
      .eq('user_id', userId)
      .eq('date', existing.date)
      .maybeSingle();

    if (journal?.status === 'finished') {
      return res.status(403).json({ error: 'Cannot delete events on a finished day' });
    }

    const { error } = await userDb(req).from('events').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
