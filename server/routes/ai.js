import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { refineJournal, generateARAS, summarizeJournalPeriod } from '../services/groq.js';

const router = Router();
router.use(requireAuth);

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: { error: 'Too many AI requests. Please wait before trying again.' }
});

router.use(aiLimiter);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AI_CONTENT = 20_000;
const VALID_PERIODS = new Set(['week', 'month']);
const SUMMARY_SELECT =
  'id, summary, period_type, start_date, end_date, entry_count, summarized_entry_count, total_hours, updated_at, pinned';

function isMissingSummaryTableError(error) {
  const message = error?.message || '';
  return error?.code === '42P01' || message.includes('journal_period_summaries');
}

function isMissingSummaryPinColumnError(error) {
  const message = error?.message || '';
  return error?.code === '42703' && message.includes('pinned');
}

function validateAIInput(req, res) {
  const { journal_id, content } = req.body;
  if (!journal_id || !UUID_RE.test(journal_id)) {
    res.status(400).json({ error: 'Valid journal_id is required' });
    return false;
  }
  if (!content || typeof content !== 'string' || content.trim().length < 10) {
    res.status(400).json({ error: 'Content must be at least 10 characters' });
    return false;
  }
  if (content.length > MAX_AI_CONTENT) {
    res.status(400).json({ error: `Content is too long (max ${MAX_AI_CONTENT} characters)` });
    return false;
  }
  return true;
}

function hasSummaryContent(entry) {
  return [
    entry.content_raw,
    entry.content_ai_refined,
    entry.aras_action,
    entry.aras_reflection,
    entry.aras_analysis,
    entry.aras_summary
  ].some((value) => typeof value === 'string' && value.trim().length >= 10);
}

function mapStoredSummary(data) {
  if (!data) return null;

  return {
    id: data.id,
    summary: data.summary,
    period: data.period_type,
    start_date: data.start_date,
    end_date: data.end_date,
    entry_count: data.entry_count,
    summarized_entry_count: data.summarized_entry_count,
    total_hours: Number(data.total_hours) || 0,
    updated_at: data.updated_at,
    pinned: Boolean(data.pinned)
  };
}

function validateSummaryInput(req, res) {
  const source = req.method === 'GET' ? req.query : req.body;
  const { period, start_date, end_date } = source;

  if (!VALID_PERIODS.has(period)) {
    res.status(400).json({ error: 'period must be either week or month' });
    return false;
  }

  if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date)) {
    res.status(400).json({ error: 'Valid start_date and end_date are required (YYYY-MM-DD)' });
    return false;
  }

  if (start_date > end_date) {
    res.status(400).json({ error: 'start_date must be on or before end_date' });
    return false;
  }

  return true;
}

async function fetchStoredSummary(userId, period, startDate, endDate) {
  let { data, error } = await supabaseAdmin
    .from('journal_period_summaries')
    .select(SUMMARY_SELECT)
    .eq('user_id', userId)
    .eq('period_type', period)
    .eq('start_date', startDate)
    .eq('end_date', endDate)
    .maybeSingle();

  if (error && isMissingSummaryPinColumnError(error)) {
    ({ data, error } = await supabaseAdmin
      .from('journal_period_summaries')
      .select('id, summary, period_type, start_date, end_date, entry_count, summarized_entry_count, total_hours, updated_at')
      .eq('user_id', userId)
      .eq('period_type', period)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .maybeSingle());
  }

  if (error) {
    if (isMissingSummaryTableError(error)) {
      return null;
    }
    throw error;
  }

  if (!data) return null;

  return mapStoredSummary(data);
}

router.post('/refine', async (req, res) => {
  if (!validateAIInput(req, res)) return;
  const { journal_id, content } = req.body;

  try {
    const { data: entry } = await supabaseAdmin
      .from('journals')
      .select('id, status')
      .eq('id', journal_id)
      .eq('user_id', req.user.id)
      .single();

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    if (entry.status === 'finished') {
      return res.status(403).json({ error: 'Cannot refine a finished entry' });
    }

    const { refined, tokens } = await refineJournal(content);

    await supabaseAdmin
      .from('journals')
      .update({
        content_ai_refined: refined,
        updated_at: new Date().toISOString()
      })
      .eq('id', journal_id);

    await supabaseAdmin.from('ai_logs').insert({
      user_id: req.user.id,
      journal_id,
      action: 'refine',
      input_text: content,
      output_text: refined,
      model: 'llama-3.1-8b-instant',
      tokens_used: tokens
    });

    res.json({ refined });
  } catch (err) {
    console.error('AI refine error:', err);
    res.status(500).json({ error: 'AI refinement failed' });
  }
});

router.post('/aras', async (req, res) => {
  if (!validateAIInput(req, res)) return;
  const { journal_id, content } = req.body;

  try {
    const { data: entry } = await supabaseAdmin
      .from('journals')
      .select('id, status')
      .eq('id', journal_id)
      .eq('user_id', req.user.id)
      .single();

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    if (entry.status === 'finished') {
      return res.status(403).json({ error: 'Cannot modify a finished entry' });
    }

    const { aras, tokens } = await generateARAS(content);

    await supabaseAdmin
      .from('journals')
      .update({
        aras_action: aras.action,
        aras_reflection: aras.reflection,
        aras_analysis: aras.analysis,
        aras_summary: aras.summary,
        updated_at: new Date().toISOString()
      })
      .eq('id', journal_id);

    await supabaseAdmin.from('ai_logs').insert({
      user_id: req.user.id,
      journal_id,
      action: 'aras',
      input_text: content,
      output_text: JSON.stringify(aras),
      model: 'llama-3.1-8b-instant',
      tokens_used: tokens
    });

    res.json({ aras });
  } catch (err) {
    console.error('AI ARAS error:', err);
    res.status(500).json({ error: 'ARAS generation failed' });
  }
});

router.post('/summary-period', async (req, res) => {
  if (!validateSummaryInput(req, res)) return;
  const { period, start_date, end_date } = req.body;

  try {
    const { data: entries, error } = await supabaseAdmin
      .from('journals')
      .select(
        'date, hours, status, content_raw, content_ai_refined, aras_action, aras_reflection, aras_analysis, aras_summary'
      )
      .eq('user_id', req.user.id)
      .gte('date', start_date)
      .lte('date', end_date)
      .order('date', { ascending: true })
      .limit(62);

    if (error) throw error;

    const allEntries = entries || [];
    const contentEntries = allEntries.filter(hasSummaryContent);

    if (contentEntries.length === 0) {
      return res.status(400).json({ error: `No journal content found for this ${period}` });
    }

    const { summary, usedEntryCount } = await summarizeJournalPeriod(contentEntries, {
      period,
      startDate: start_date,
      endDate: end_date
    });

    const totalHours = allEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const payload = {
      summary,
      entry_count: allEntries.length,
      summarized_entry_count: usedEntryCount,
      total_hours: Math.round(totalHours * 100) / 100,
      updated_at: new Date().toISOString()
    };

    const upsertPayload = {
      user_id: req.user.id,
      period_type: period,
      start_date,
      end_date,
      model: 'llama-3.1-8b-instant',
      ...payload
    };

    const { error: upsertError } = await supabaseAdmin
      .from('journal_period_summaries')
      .upsert(upsertPayload, {
        onConflict: 'user_id,period_type,start_date,end_date'
      });

    const persisted = !upsertError;
    if (upsertError && !isMissingSummaryTableError(upsertError)) throw upsertError;

    const savedSummary = persisted
      ? await fetchStoredSummary(req.user.id, period, start_date, end_date)
      : null;

    if (savedSummary) {
      return res.json({
        ...savedSummary,
        persisted: true
      });
    }

    res.json({
      period,
      start_date,
      end_date,
      pinned: false,
      persisted,
      ...payload
    });
  } catch (err) {
    console.error('AI period summary error:', err);
    res.status(500).json({ error: 'Period summary generation failed' });
  }
});

router.get('/summary-library', async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 24, 60));

  try {
    let { data, error } = await supabaseAdmin
      .from('journal_period_summaries')
      .select(SUMMARY_SELECT)
      .eq('user_id', req.user.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error && isMissingSummaryPinColumnError(error)) {
      ({ data, error } = await supabaseAdmin
        .from('journal_period_summaries')
        .select('id, summary, period_type, start_date, end_date, entry_count, summarized_entry_count, total_hours, updated_at')
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(limit));
    }

    if (error) {
      if (isMissingSummaryTableError(error)) {
        return res.json([]);
      }

      throw error;
    }

    res.json((data || []).map(mapStoredSummary));
  } catch (err) {
    console.error('Fetch AI summary library error:', err);
    res.status(500).json({ error: 'Failed to fetch summary library' });
  }
});

router.post('/summary-library/:id/pin', async (req, res) => {
  const { id } = req.params;
  const { pinned } = req.body;

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Valid summary id is required' });
  }

  if (typeof pinned !== 'boolean') {
    return res.status(400).json({ error: 'pinned must be a boolean value' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('journal_period_summaries')
      .update({
        pinned,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select(SUMMARY_SELECT)
      .single();

    if (error) {
      if (isMissingSummaryPinColumnError(error)) {
        return res.status(400).json({ error: 'Summary pinning becomes available after the latest database migration is applied.' });
      }

      if (isMissingSummaryTableError(error)) {
        return res.status(400).json({ error: 'Summary pinning is unavailable until the latest migration is applied.' });
      }

      throw error;
    }

    res.json(mapStoredSummary(data));
  } catch (err) {
    console.error('Pin AI summary error:', err);
    res.status(500).json({ error: 'Failed to update summary pin' });
  }
});

router.get('/summary-period', async (req, res) => {
  if (!validateSummaryInput(req, res)) return;
  const { period, start_date, end_date } = req.query;

  try {
    const summary = await fetchStoredSummary(req.user.id, period, start_date, end_date);
    res.json(summary);
  } catch (err) {
    console.error('Fetch AI period summary error:', err);
    res.status(500).json({ error: 'Failed to fetch saved period summary' });
  }
});

export default router;
