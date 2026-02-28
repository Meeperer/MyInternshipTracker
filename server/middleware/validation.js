const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CONTENT_LENGTH = 50_000;

export function validateDateParam(req, res, next) {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  next();
}

export function validateJournalEntry(req, res, next) {
  const { date, hours, content_raw } = req.body;

  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  }

  if (hours !== undefined) {
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0 || h > 24) {
      return res.status(400).json({ error: 'Hours must be between 0 and 24' });
    }
  }

  if (content_raw !== undefined) {
    if (typeof content_raw !== 'string') {
      return res.status(400).json({ error: 'content_raw must be a string' });
    }
    if (content_raw.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: `Content is too long (max ${MAX_CONTENT_LENGTH} characters)` });
    }
  }

  next();
}

export function validateFinishDay(req, res, next) {
  const { date } = req.body;

  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  }

  next();
}

export function validateHours(req, res, next) {
  const { date, hours } = req.body;

  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  }

  const h = parseFloat(hours);
  if (isNaN(h) || h < 0.5 || h > 24) {
    return res.status(400).json({ error: 'Hours must be between 0.5 and 24' });
  }

  next();
}
