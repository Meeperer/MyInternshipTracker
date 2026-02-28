import { writable, derived } from 'svelte/store';
import { api } from '$utils/api.js';

function createAuthStore() {
  const { subscribe, set, update } = writable({
    user: null,
    profile: null,
    loading: true
  });

  return {
    subscribe,

    async init() {
      const session = localStorage.getItem('session');
      if (!session) {
        set({ user: null, profile: null, loading: false });
        return;
      }

      try {
        const profile = await api.get('/auth/me');
        set({
          user: { id: profile.id, email: profile.email },
          profile,
          loading: false
        });
      } catch {
        localStorage.removeItem('session');
        set({ user: null, profile: null, loading: false });
      }
    },

    async login(email, password) {
      const data = await api.post('/auth/login', { email, password });
      localStorage.setItem('session', JSON.stringify(data.session));

      const profile = await api.get('/auth/me');
      set({
        user: data.user,
        profile,
        loading: false
      });
    },

    async register(email, password, full_name) {
      await api.post('/auth/register', { email, password, full_name });
    },

    logout() {
      localStorage.removeItem('session');
      set({ user: null, profile: null, loading: false });
    }
  };
}

export const auth = createAuthStore();
export const isAuthenticated = derived(auth, $a => !!$a.user);
export const isLoading = derived(auth, $a => $a.loading);
