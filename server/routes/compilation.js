import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { generateCompiledPDF } from '../services/pdf.js';
import { TARGET_HOURS } from '../../shared/constants.js';

const router = Router();
router.use(requireAuth);

router.get('/status', async (req, res) => {
  try {
    const { data: progress } = await supabaseAdmin
      .from('internship_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    const { data: report } = await supabaseAdmin
      .from('compiled_reports')
      .select('id, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      eligible: (progress?.total_hours || 0) >= TARGET_HOURS,
      total_hours: progress?.total_hours || 0,
      is_completed: progress?.is_completed || false,
      has_report: !!report,
      report_id: report?.id || null
    });
  } catch (err) {
    console.error('Compilation status error:', err);
    res.status(500).json({ error: 'Failed to check compilation status' });
  }
});

router.post('/compile', async (req, res) => {
  try {
    const { data: progress } = await supabaseAdmin
      .from('internship_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!progress || progress.total_hours < TARGET_HOURS) {
      const remaining = TARGET_HOURS - (progress?.total_hours || 0);
      return res.status(403).json({
        error: `Cannot compile yet. ${remaining} hours remaining.`
      });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, internship_company')
      .eq('id', req.user.id)
      .single();

    const { data: entries, error } = await supabaseAdmin
      .from('journals')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'finished')
      .order('date', { ascending: true });

    if (error) throw error;

    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: 'No finished journal entries found' });
    }

    const reportData = {
      userName: profile?.full_name || 'N/A',
      company: profile?.internship_company || 'N/A',
      dateRangeStart: entries[0].date,
      dateRangeEnd: entries[entries.length - 1].date,
      totalHours: progress.total_hours,
      totalDays: entries.length,
      entries
    };

    await supabaseAdmin.from('compiled_reports').insert({
      user_id: req.user.id,
      title: 'Internship Journal Compilation',
      date_range_start: reportData.dateRangeStart,
      date_range_end: reportData.dateRangeEnd,
      total_hours: reportData.totalHours,
      total_days: reportData.totalDays,
      report_data: reportData
    });

    res.json({ message: 'Report compiled successfully', reportData });
  } catch (err) {
    console.error('Compilation error:', err);
    res.status(500).json({ error: 'Compilation failed' });
  }
});

router.get('/download', async (req, res) => {
  try {
    const { data: report } = await supabaseAdmin
      .from('compiled_reports')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!report) {
      return res.status(404).json({ error: 'No compiled report found. Compile first.' });
    }

    const pdfBuffer = await generateCompiledPDF(report.report_data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Internship_Journal_${report.date_range_start}_to_${report.date_range_end}.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF download error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
