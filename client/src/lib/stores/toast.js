import { writable } from 'svelte/store';

function createToastStore() {
  const { subscribe, set } = writable(null);
  let timeout;

  function show(message, type = 'success', duration = 3000) {
    clearTimeout(timeout);
    set({ message, type });
    timeout = setTimeout(() => set(null), duration);
  }

  return {
    subscribe,
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    clear: () => { clearTimeout(timeout); set(null); }
  };
}

export const toast = createToastStore();
