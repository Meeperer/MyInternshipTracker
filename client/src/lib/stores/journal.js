import { writable } from 'svelte/store';
import { api } from '$utils/api.js';

function createJournalStore() {
  const { subscribe, set, update } = writable({
    entries: [],
    currentEntry: null,
    loading: false
  });

  return {
    subscribe,

    async fetchMonth(year, month) {
      update(s => ({ ...s, loading: true }));
      try {
        const entries = await api.get(`/journals?year=${year}&month=${month}`);
        update(s => ({ ...s, entries, loading: false }));
      } catch (err) {
        console.error('Failed to fetch journals:', err);
        update(s => ({ ...s, loading: false }));
      }
    },

    /** Fetch all journal entries for the current account only (export). */
    async fetchAll() {
      const entries = await api.get('/journals/export');
      return entries;
    },

    async fetchDate(date) {
      try {
        const entry = await api.get(`/journals/${date}`);
        update(s => ({ ...s, currentEntry: entry }));
        return entry;
      } catch (err) {
        console.error('Failed to fetch journal:', err);
        update(s => ({ ...s, currentEntry: null }));
        return null;
      }
    },

    async save(data) {
      const result = await api.post('/journals', data);
      update(s => {
        const entries = [...s.entries];
        const idx = entries.findIndex(e => e.date === data.date);
        if (idx >= 0) {
          entries[idx] = result;
        } else {
          entries.push(result);
          entries.sort((a, b) => a.date.localeCompare(b.date));
        }
        return { ...s, entries, currentEntry: result };
      });
      return result;
    },

    async logHours(date, hours) {
      const result = await api.post('/journals/log-hours', { date, hours });
      update(s => {
        const entries = [...s.entries];
        const idx = entries.findIndex(e => e.date === date);
        if (idx >= 0) {
          entries[idx] = result;
        } else {
          entries.push(result);
          entries.sort((a, b) => a.date.localeCompare(b.date));
        }
        return { ...s, entries, currentEntry: result };
      });
      return result;
    },

    async finishDay(date) {
      const result = await api.post('/journals/finish-day', { date });
      update(s => {
        const entries = s.entries.map(e => e.date === date ? result : e);
        return { ...s, entries, currentEntry: result };
      });
      return result;
    },

    async refineWithAI(journalId, content) {
      return await api.post('/ai/refine', { journal_id: journalId, content });
    },

    async generateARAS(journalId, content) {
      return await api.post('/ai/aras', { journal_id: journalId, content });
    },

    clearCurrent() {
      update(s => ({ ...s, currentEntry: null }));
    }
  };
}

export const journal = createJournalStore();
