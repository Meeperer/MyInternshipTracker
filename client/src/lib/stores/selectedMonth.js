import { writable } from 'svelte/store';
import { getMonthValueFromDateString, monthValueFromDate, shiftMonthValue } from '$utils/date.js';

const STORAGE_KEY = 'selected-journal-month';

function getInitialValue() {
  if (typeof localStorage === 'undefined') {
    return monthValueFromDate();
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && /^\d{4}-\d{2}$/.test(saved)) {
    return saved;
  }

  return monthValueFromDate();
}

function createSelectedMonthStore() {
  const { subscribe, set, update } = writable(getInitialValue());

  function persist(value) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value);
    }
  }

  return {
    subscribe,

    init() {
      const value = getInitialValue();
      set(value);
      persist(value);
    },

    set(value) {
      persist(value);
      set(value);
    },

    setFromDate(dateStr) {
      const value = getMonthValueFromDateString(dateStr);
      persist(value);
      set(value);
    },

    shift(delta) {
      update((current) => {
        const next = shiftMonthValue(current, delta);
        persist(next);
        return next;
      });
    },

    reset() {
      const value = monthValueFromDate();
      persist(value);
      set(value);
    }
  };
}

export const selectedMonth = createSelectedMonthStore();
