import { writable } from 'svelte/store';
import { api } from '$utils/api.js';
import { TARGET_HOURS } from '$lib/constants.js';

function createProgressStore() {
  const { subscribe, set } = writable({
    total_hours: 0,
    remaining_hours: TARGET_HOURS,
    days_completed: 0,
    current_streak: 0,
    longest_streak: 0,
    percentage: 0,
    is_completed: false,
    target_hours: TARGET_HOURS,
    loading: true
  });

  return {
    subscribe,

    async fetch() {
      try {
        const data = await api.get('/progress');
        set({ ...data, loading: false });
      } catch (err) {
        console.error('Failed to fetch progress:', err);
        set({
          total_hours: 0,
          remaining_hours: TARGET_HOURS,
          days_completed: 0,
          current_streak: 0,
          longest_streak: 0,
          percentage: 0,
          is_completed: false,
          target_hours: TARGET_HOURS,
          loading: false
        });
      }
    },

    reset() {
      set({
        total_hours: 0,
        remaining_hours: TARGET_HOURS,
        days_completed: 0,
        current_streak: 0,
        longest_streak: 0,
        percentage: 0,
        is_completed: false,
        target_hours: TARGET_HOURS,
        loading: true
      });
    }
  };
}

export const progress = createProgressStore();
