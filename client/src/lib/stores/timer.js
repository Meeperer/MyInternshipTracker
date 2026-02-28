import { writable, derived, get } from 'svelte/store';
import { formatTimer } from '$utils/date.js';
import { toast } from './toast.js';

function createTimerStore() {
  let interval = null;
  const baseDuration = writable(25 * 60);
  const remaining = writable(25 * 60);
  const state = writable('stopped');

  function start() {
    if (get(remaining) <= 0) {
      remaining.set(get(baseDuration));
    }
    state.set('running');
    interval = setInterval(() => {
      remaining.update(r => {
        if (r <= 1) {
          clearInterval(interval);
          interval = null;
          state.set('stopped');
          if (typeof window !== 'undefined') {
            try { new Audio('data:audio/wav;base64,UklGRl9vT19teleGFtcGxl').play(); } catch {}
            toast.success('Pomodoro complete!');
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  function pause() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    state.set('paused');
  }

  function reset() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    state.set('stopped');
    remaining.set(get(baseDuration));
  }

  function setDuration(minutes) {
    const clamped = Math.max(1, Math.min(180, minutes));
    const seconds = clamped * 60;
    baseDuration.set(seconds);
    let currentState;
    state.subscribe(s => currentState = s)();
    if (currentState === 'stopped') {
      remaining.set(seconds);
    }
  }

  function adjustDuration(delta) {
    let current;
    baseDuration.subscribe(d => current = d)();
    setDuration(Math.round(current / 60) + delta);
  }

  return {
    remaining,
    state,
    baseDuration,
    display: derived(remaining, formatTimer),
    baseMinutes: derived(baseDuration, d => Math.round(d / 60)),
    start,
    pause,
    reset,
    setDuration,
    adjustDuration
  };
}

export const timer = createTimerStore();
