<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { appCommands } from '$stores/appCommands.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { todayString } from '$utils/date.js';

  let search = $state('');
  let selectedIndex = $state(0);
  let inputEl = $state(null);

  function makeCommand(type, payload = {}) {
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      ...payload
    };
  }

  const actions = [
    {
      id: 'dashboard',
      label: 'Go to dashboard',
      hint: 'Overview, progress, and achievements',
      shortcut: 'Ctrl/Cmd + 1',
      match: ['dashboard', 'overview', 'home'],
      run: async () => goto('/dashboard')
    },
    {
      id: 'calendar',
      label: 'Go to calendar',
      hint: 'Open the calendar workspace',
      shortcut: 'Ctrl/Cmd + 2',
      match: ['calendar', 'month', 'dates'],
      run: async () => goto('/calendar')
    },
    {
      id: 'pomodoro',
      label: 'Go to pomodoro',
      hint: 'Start or adjust a focus session',
      shortcut: 'Ctrl/Cmd + 3',
      match: ['pomodoro', 'timer', 'focus'],
      run: async () => goto('/pomodoro')
    },
    {
      id: 'journal',
      label: 'Go to journal',
      hint: 'Review entries, insights, and summaries',
      shortcut: 'Ctrl/Cmd + 4',
      match: ['journal', 'entries', 'notes'],
      run: async () => goto('/journal')
    },
    {
      id: 'new-entry',
      label: "Open today's journal entry",
      hint: 'Jump straight into writing or logging hours',
      shortcut: 'N',
      match: ['new', 'entry', 'today', 'write'],
      run: async () => {
        selectedMonth.setFromDate(todayString());
        appCommands.queue(makeCommand('open-journal-date', { date: todayString() }));
        await goto('/journal');
      }
    },
    {
      id: 'journal-search',
      label: 'Focus journal search',
      hint: 'Jump to entry search instantly',
      shortcut: '/',
      match: ['search', 'find', 'journal'],
      run: async () => {
        appCommands.queue(makeCommand('focus-journal-search'));
        await goto('/journal');
      }
    },
    {
      id: 'summary-library',
      label: 'Open summary library',
      hint: 'Browse saved weekly and monthly summaries',
      shortcut: 'Shift + L',
      match: ['summary', 'library', 'weekly', 'monthly'],
      run: async () => {
        appCommands.queue(makeCommand('focus-summary-library'));
        await goto('/journal');
      }
    },
    {
      id: 'prev-month',
      label: 'Previous month',
      hint: 'Shift the shared month backwards',
      shortcut: '[',
      match: ['previous', 'month', 'back'],
      run: async () => selectedMonth.shift(-1)
    },
    {
      id: 'next-month',
      label: 'Next month',
      hint: 'Shift the shared month forward',
      shortcut: ']',
      match: ['next', 'month', 'forward'],
      run: async () => selectedMonth.shift(1)
    }
  ];

  let isOpen = $derived($appCommands.paletteOpen);
  let currentPath = $derived($page.url.pathname);
  let filteredActions = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return actions;

    return actions.filter((action) =>
      action.label.toLowerCase().includes(query) ||
      action.hint.toLowerCase().includes(query) ||
      action.match.some((term) => term.includes(query))
    );
  });

  $effect(() => {
    if (!isOpen) {
      search = '';
      selectedIndex = 0;
      return;
    }

    queueMicrotask(() => inputEl?.focus());
  });

  $effect(() => {
    if (selectedIndex >= filteredActions.length) {
      selectedIndex = Math.max(0, filteredActions.length - 1);
    }
  });

  function closePalette() {
    appCommands.closePalette();
  }

  async function runAction(action) {
    if (!action) return;
    closePalette();
    await action.run();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(filteredActions.length - 1, selectedIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      runAction(filteredActions[selectedIndex]);
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-overlay command-palette-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="command-palette-title"
    tabindex="-1"
    onclick={(event) => {
      if (event.target === event.currentTarget) closePalette();
    }}
    onkeydown={handleKeydown}
  >
    <div class="modal-content command-palette animate-rise rise-2">
      <div class="command-palette-header">
        <div>
          <span class="command-kicker">Quick command</span>
          <h2 id="command-palette-title">Move faster through the tracker</h2>
        </div>
        <button type="button" class="command-close" onclick={closePalette} aria-label="Close command palette">
          &times;
        </button>
      </div>

      <label class="sr-only" for="command-palette-input">Search commands</label>
      <input
        id="command-palette-input"
        bind:this={inputEl}
        bind:value={search}
        class="command-input"
        type="text"
        placeholder={`Search commands${currentPath ? ` for ${currentPath.replace('/', '') || 'home'}` : ''}`}
      />

      <div class="command-shortcuts">
        <span>Ctrl/Cmd + K opens this palette</span>
        <span>N opens today's entry</span>
        <span>/ jumps to journal search</span>
      </div>

      {#if filteredActions.length}
        <div class="command-results" role="listbox" aria-label="Command results">
          {#each filteredActions as action, index}
            <button
              type="button"
              class="command-result"
              class:selected={index === selectedIndex}
              onclick={() => runAction(action)}
            >
              <span class="command-result-copy">
                <strong>{action.label}</strong>
                <span>{action.hint}</span>
              </span>
              <span class="command-result-shortcut">{action.shortcut}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="command-empty">
          <strong>No matching command</strong>
          <p>Try words like “journal”, “summary”, “calendar”, or “month”.</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .command-palette-overlay {
    align-items: flex-start;
    padding-top: min(10vh, 5rem);
  }

  .command-palette {
    max-width: 760px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 251, 244, 0.96));
    border: 1px solid rgba(190, 53, 25, 0.12);
  }

  .command-palette-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .command-kicker {
    display: inline-flex;
    margin-bottom: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--red);
  }

  .command-palette-header h2 {
    margin: 0;
    font-size: clamp(1.5rem, 2.2vw, 2rem);
  }

  .command-close {
    width: 2.5rem;
    height: 2.5rem;
    border: none;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    color: var(--red);
    font-size: 1.4rem;
    line-height: 1;
  }

  .command-input {
    width: 100%;
    min-height: 56px;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid rgba(190, 53, 25, 0.16);
    background: rgba(255, 255, 255, 0.96);
    font-family: var(--font-ui);
    font-size: 0.98rem;
    color: var(--dark);
  }

  .command-input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 4px rgba(190, 53, 25, 0.1);
  }

  .command-shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 0.85rem;
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.76rem;
  }

  .command-shortcuts span {
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.86);
    border: 1px solid rgba(190, 53, 25, 0.08);
  }

  .command-results {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 1rem;
  }

  .command-result {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    width: 100%;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid rgba(190, 53, 25, 0.1);
    background: rgba(255, 255, 255, 0.86);
    text-align: left;
    transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
  }

  .command-result:hover,
  .command-result.selected {
    transform: translateY(-1px);
    border-color: rgba(190, 53, 25, 0.2);
    box-shadow: 0 14px 28px rgba(42, 25, 8, 0.08);
    background: rgba(255, 255, 255, 0.97);
  }

  .command-result-copy {
    display: grid;
    gap: 0.2rem;
  }

  .command-result-copy strong {
    font-family: var(--font-display);
    font-size: 1.02rem;
    color: var(--red);
  }

  .command-result-copy span {
    font-family: var(--font-ui);
    font-size: 0.86rem;
    color: var(--dark-soft);
  }

  .command-result-shortcut {
    flex-shrink: 0;
    padding: 0.35rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(190, 53, 25, 0.12);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .command-empty {
    margin-top: 1rem;
    padding: 1.2rem;
    border-radius: 18px;
    border: 1px dashed rgba(190, 53, 25, 0.18);
    background: rgba(255, 255, 255, 0.7);
    text-align: center;
    color: var(--dark-soft);
  }

  .command-empty strong {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--red);
    font-family: var(--font-display);
    font-size: 1.05rem;
  }

  @media (max-width: 768px) {
    .command-palette-overlay {
      padding-top: 1.5rem;
    }

    .command-result {
      flex-direction: column;
      align-items: flex-start;
    }

    .command-result-shortcut {
      align-self: flex-start;
    }
  }
</style>
