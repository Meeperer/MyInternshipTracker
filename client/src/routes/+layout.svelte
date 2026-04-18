<script>
  import '../app.css';
  import Toast from '$components/Toast.svelte';
  import CommandPalette from '$components/CommandPalette.svelte';
  import { auth } from '$stores/auth.js';
  import { appCommands } from '$stores/appCommands.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { todayString } from '$utils/date.js';

  let { children } = $props();

  onMount(() => {
    auth.init();

    function handleGlobalKeys(e) {
      const target = e.target;
      const isTypingTarget = target instanceof HTMLElement && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        appCommands.togglePalette();
        return;
      }

      if (isTypingTarget) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        switch (e.key) {
          case '1': e.preventDefault(); goto('/dashboard'); break;
          case '2': e.preventDefault(); goto('/calendar'); break;
          case '3': e.preventDefault(); goto('/pomodoro'); break;
          case '4': e.preventDefault(); goto('/journal'); break;
        }
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        selectedMonth.setFromDate(todayString());
        appCommands.queue({
          id: `open-journal-date-${Date.now()}`,
          type: 'open-journal-date',
          date: todayString()
        });
        goto('/journal');
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        appCommands.queue({
          id: `focus-journal-search-${Date.now()}`,
          type: 'focus-journal-search'
        });
        goto('/journal');
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        appCommands.queue({
          id: `focus-summary-library-${Date.now()}`,
          type: 'focus-summary-library'
        });
        goto('/journal');
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        selectedMonth.shift(-1);
        return;
      }

      if (e.key === ']') {
        e.preventDefault();
        selectedMonth.shift(1);
      }
    }

    document.addEventListener('keydown', handleGlobalKeys);
    return () => document.removeEventListener('keydown', handleGlobalKeys);
  });
</script>

<div class="site-shell">
  <div class="site-content">
    {@render children()}
  </div>
</div>
<CommandPalette />
<Toast />

<style>
  .site-shell {
    position: relative;
    min-height: 100vh;
    isolation: isolate;
    background: var(--bg);
    overflow-x: clip;
  }

  .site-content {
    position: relative;
    z-index: 1;
    min-height: 100vh;
  }
</style>
