import { writable } from 'svelte/store';

const STORAGE_KEY = 'userTimezone';

const getDefaultTimezone = () => {
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return 'UTC';
};

const DEFAULT_TIMEZONE = getDefaultTimezone();

function createTimezoneStore() {
  let initial = DEFAULT_TIMEZONE;

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      initial = stored;
    }
  }

  const store = writable(initial);

  if (typeof window !== 'undefined') {
    store.subscribe((value) => {
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        // ignore persistence errors
      }
    });
  }

  return store;
}

export const timezone = createTimezoneStore();

export const timezoneOptions = [
  { value: DEFAULT_TIMEZONE, label: 'Local time (system)' },
  { value: 'UTC', label: '(UTC+00:00) Coordinated Universal Time' },
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time (US & Canada)' },
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) Brasília' },
  { value: 'Europe/London', label: '(UTC+00:00) Dublin, Edinburgh, Lisbon, London' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) Amsterdam, Berlin, Rome, Stockholm' },
  { value: 'Europe/Helsinki', label: '(UTC+02:00) Helsinki, Kyiv, Riga, Sofia' },
  { value: 'Asia/Dubai', label: '(UTC+04:00) Abu Dhabi, Muscat' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
  { value: 'Asia/Bangkok', label: '(UTC+07:00) Bangkok, Hanoi, Jakarta' },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) Beijing, Chongqing, Hong Kong' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Osaka, Sapporo, Tokyo' },
  { value: 'Australia/Sydney', label: '(UTC+10:00) Canberra, Melbourne, Sydney' }
];

export const getTimezoneLabel = (tz) => {
  const match = timezoneOptions.find((opt) => opt.value === tz);
  if (match) return match.label;
  if (tz === DEFAULT_TIMEZONE) return 'Local time (system)';
  return tz.replace(/_/g, ' ');
};

