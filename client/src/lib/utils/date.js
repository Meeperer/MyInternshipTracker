export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDateLong(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export function toDateString(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayString() {
  return toDateString(new Date());
}

export function monthValueFromDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthValue(monthValue) {
  const [year, month] = String(monthValue || '').split('-').map(Number);
  return { year, month };
}

export function shiftMonthValue(monthValue, delta) {
  const { year, month } = parseMonthValue(monthValue);
  const shifted = new Date(year, (month || 1) - 1 + delta, 1);
  return monthValueFromDate(shifted);
}

export function getMonthRange(monthValue) {
  const { year, month } = parseMonthValue(monthValue);
  const normalizedMonth = month || 1;
  return {
    startDate: `${year}-${String(normalizedMonth).padStart(2, '0')}-01`,
    endDate: toDateString(new Date(year, normalizedMonth, 0))
  };
}

export function getMonthValueFromDateString(dateStr) {
  return monthValueFromDate(new Date(`${dateStr}T00:00:00`));
}

export function shiftDate(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

export function isToday(dateStr) {
  return dateStr === todayString();
}

export function isPast(dateStr) {
  return dateStr < todayString();
}

export function formatTimer(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}
