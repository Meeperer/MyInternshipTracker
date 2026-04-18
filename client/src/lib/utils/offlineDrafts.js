const STORAGE_PREFIX = 'journal-offline-draft:';

function getStorageKey(date) {
  return `${STORAGE_PREFIX}${date}`;
}

export function loadOfflineDraft(date) {
  if (typeof localStorage === 'undefined' || !date) return null;

  try {
    const raw = localStorage.getItem(getStorageKey(date));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveOfflineDraft(date, draft) {
  if (typeof localStorage === 'undefined' || !date || !draft) return null;

  const payload = {
    date,
    updatedAt: new Date().toISOString(),
    hours: draft.hours ?? '',
    content_raw: draft.content_raw ?? '',
    mode: draft.mode || 'edit',
    unsynced: Boolean(draft.unsynced)
  };

  localStorage.setItem(getStorageKey(date), JSON.stringify(payload));
  return payload;
}

export function clearOfflineDraft(date) {
  if (typeof localStorage === 'undefined' || !date) return;
  localStorage.removeItem(getStorageKey(date));
}

export function hasMeaningfulOfflineDraft(draft) {
  if (!draft) return false;
  const hoursText = String(draft.hours ?? '').trim();
  const contentText = String(draft.content_raw ?? '').trim();
  return Boolean(hoursText || contentText);
}
