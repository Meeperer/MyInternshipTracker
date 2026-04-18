import { writable } from 'svelte/store';

function createAppCommandsStore() {
  const { subscribe, update } = writable({
    paletteOpen: false,
    pendingCommand: null
  });

  return {
    subscribe,

    openPalette() {
      update((state) => ({ ...state, paletteOpen: true }));
    },

    closePalette() {
      update((state) => ({ ...state, paletteOpen: false }));
    },

    togglePalette() {
      update((state) => ({ ...state, paletteOpen: !state.paletteOpen }));
    },

    queue(command) {
      update((state) => ({
        ...state,
        pendingCommand: command || null
      }));
    },

    consume(id) {
      update((state) => {
        if (!state.pendingCommand || state.pendingCommand.id !== id) {
          return state;
        }

        return {
          ...state,
          pendingCommand: null
        };
      });
    }
  };
}

export const appCommands = createAppCommandsStore();
