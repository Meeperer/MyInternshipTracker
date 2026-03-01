import { writable } from 'svelte/store';
import { api } from '$utils/api.js';

function createEventsStore() {
  const { subscribe, update } = writable({ events: [], loading: false });

  return {
    subscribe,

    async fetchMonth(year, month) {
      update(s => ({ ...s, loading: true }));
      try {
        const list = await api.get(`/events?year=${year}&month=${month}`);
        update(s => ({ ...s, events: list || [], loading: false }));
      } catch {
        update(s => ({ ...s, loading: false }));
      }
    },

    async fetchDate(date) {
      try {
        return await api.get(`/events?date=${date}`);
      } catch {
        return [];
      }
    },

    async create(eventData) {
      const result = await api.post('/events', eventData);
      update(s => ({ ...s, events: [...s.events, result] }));
      return result;
    },

    async updateEvent(id, eventData) {
      const result = await api.put(`/events/${id}`, eventData);
      update(s => ({
        ...s,
        events: s.events.map(e => (e.id === id ? result : e))
      }));
      return result;
    },

    async deleteEvent(id) {
      await api.del(`/events/${id}`);
      update(s => ({ ...s, events: s.events.filter(e => e.id !== id) }));
    },

    getEventsByDate(eventsList) {
      const map = {};
      for (const ev of eventsList || []) {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
      }
      return map;
    }
  };
}

export const events = createEventsStore();
