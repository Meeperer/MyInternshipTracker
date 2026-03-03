import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { TARGET_HOURS } from '../../shared/constants.js';

const router = Router();
router.use(requireAuth);

function computeStreaks(sortedDatesDesc) {
  if (sortedDatesDesc.length === 0) return { current: 0, longest: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let longest = 0;
  let streak = 1;

  for (let i = 1; i < sortedDatesDesc.length; i++) {
    const curr = new Date(sortedDatesDesc[i - 1] + 'T00:00:00');
    const prev = new Date(sortedDatesDesc[i] + 'T00:00:00');
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      streak++;
    } else {
      if (streak > longest) longest = streak;
      streak = 1;
    }
  }
  if (streak > longest) longest = streak;

  let current = 0;
  const mostRecent = new Date(sortedDatesDesc[0] + 'T00:00:00');
  if (mostRecent >= yesterday) {
    current = 1;
    for (let i = 1; i < sortedDatesDesc.length; i++) {
      const curr = new Date(sortedDatesDesc[i - 1] + 'T00:00:00');
      const prev = new Date(sortedDatesDesc[i] + 'T00:00:00');
      if (Math.round((curr - prev) / 86400000) === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  return { current, longest };
}

router.get('/', async (req, res) => {
  try {
    const { data: finished, error } = await supabaseAdmin
      .from('journals')
      .select('date, hours')
      .eq('user_id', req.user.id)
      .eq('status', 'finished')
      .order('date', { ascending: false });

    if (error) throw error;

    const entries = finished || [];
    const total_hours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const days_completed = entries.length;
    const dates = entries.map(e => e.date);
    const { current: current_streak, longest: longest_streak } = computeStreaks(dates);
    const is_completed = total_hours >= TARGET_HOURS;

    const percentage = Math.min(((total_hours / TARGET_HOURS) * 100).toFixed(1), 100);
    const remaining = Math.max(TARGET_HOURS - total_hours, 0);

    res.json({
      total_hours,
      days_completed,
      current_streak,
      longest_streak,
      is_completed,
      target_hours: TARGET_HOURS,
      percentage: parseFloat(percentage),
      remaining_hours: remaining
    });
  } catch (err) {
    console.error('Fetch progress error:', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

export default router;
