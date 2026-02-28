import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { refineJournal, generateARAS } from '../services/groq.js';

const router = Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AI_CONTENT = 20_000;

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

export default router;
