import { writable } from 'svelte/store';
import { api } from '$utils/api.js';
import { progress } from '$stores/progress.js';

function createJournalStore() {
  const { subscribe, set, update } = writable({
    entries: [],
    currentEntry: null,
    loading: false,
    summaryLibrary: [],
    summaryLibraryLoading: false
  });

  function syncProgress() {
    progress.fetch().catch(() => {});
  }

  function upsertSummaryInLibrary(summary, state) {
    if (!summary?.id) return state;

    const next = [...(state.summaryLibrary || [])];
    const index = next.findIndex((item) => item.id === summary.id);

    if (index >= 0) {
      next[index] = { ...next[index], ...summary };
    } else {
      next.unshift(summary);
    }

    next.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }

      const aTime = new Date(a.updated_at || 0).getTime();
      const bTime = new Date(b.updated_at || 0).getTime();
      return bTime - aTime;
    });

    return { ...state, summaryLibrary: next };
  }

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

    async fetchAll() {
      const entries = await api.get('/journals/export');
      return entries;
    },

    async summarizePeriod(period, startDate, endDate) {
      const result = await api.post('/ai/summary-period', {
        period,
        start_date: startDate,
        end_date: endDate
      });
      update((state) => upsertSummaryInLibrary(result, state));
      return result;
    },

    async fetchPeriodSummary(period, startDate, endDate) {
      const params = new URLSearchParams({
        period,
        start_date: startDate,
        end_date: endDate
      });
      const summary = await api.get(`/ai/summary-period?${params.toString()}`);
      if (summary?.id) {
        update((state) => upsertSummaryInLibrary(summary, state));
      }
      return summary;
    },

    async fetchSummaryLibrary(limit = 24) {
      update((state) => ({ ...state, summaryLibraryLoading: true }));
      try {
        const summaries = await api.get(`/ai/summary-library?limit=${limit}`);
        update((state) => ({
          ...state,
          summaryLibrary: summaries || [],
          summaryLibraryLoading: false
        }));
        return summaries || [];
      } catch (error) {
        update((state) => ({ ...state, summaryLibraryLoading: false }));
        throw error;
      }
    },

    async toggleSummaryPin(summaryId, pinned) {
      const summary = await api.post(`/ai/summary-library/${summaryId}/pin`, { pinned });
      update((state) => upsertSummaryInLibrary(summary, state));
      return summary;
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
      syncProgress();
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
      syncProgress();
      return result;
    },

    async finishDay(date) {
      const result = await api.post('/journals/finish-day', { date });
      update(s => {
        const entries = s.entries.map(e => e.date === date ? result : e);
        return { ...s, entries, currentEntry: result };
      });
      syncProgress();
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
