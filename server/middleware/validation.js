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

const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const VALID_EVENT_TYPES = ['meeting', 'deadline', 'reminder', 'personal'];

export function validateEvent(req, res, next) {
  const { date, title, start_time, end_time, type } = req.body;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Event title is required' });
  }
  if (title.length > 200) {
    return res.status(400).json({ error: 'Title must be 200 characters or less' });
  }
  if (start_time && !TIME_24H_RE.test(start_time)) {
    return res.status(400).json({ error: 'start_time must be in HH:MM 24-hour format' });
  }
  if (end_time && !TIME_24H_RE.test(end_time)) {
    return res.status(400).json({ error: 'end_time must be in HH:MM 24-hour format' });
  }
  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ error: 'start_time must be before end_time' });
  }
  if (type && !VALID_EVENT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_EVENT_TYPES.join(', ')}` });
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
