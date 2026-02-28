import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { TARGET_HOURS } from '../../shared/constants.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_PROGRESS = {
  total_hours: 0,
  days_completed: 0,
  current_streak: 0,
  longest_streak: 0,
  is_completed: false
};

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('internship_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    const progress = data || DEFAULT_PROGRESS;
    const percentage = Math.min(((progress.total_hours / TARGET_HOURS) * 100).toFixed(1), 100);
    const remaining = Math.max(TARGET_HOURS - progress.total_hours, 0);

    res.json({
      ...progress,
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
