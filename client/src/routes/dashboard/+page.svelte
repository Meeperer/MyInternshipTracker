<script>
  import { goto } from '$app/navigation';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import AuthShell from '$components/AuthShell.svelte';
  import Dashboard from '$components/Dashboard.svelte';

  function handleNavigateToDate(date) {
    if (date) {
      selectedMonth.setFromDate(date);
    }
    goto('/calendar');
  }
</script>

<AuthShell>
  <div class="dashboard-page-shell">
    <Dashboard onNavigateToDate={handleNavigateToDate} />
  </div>
</AuthShell>

<style>
  .dashboard-page-shell {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    overflow: hidden;
  }

  :global(html),
  :global(body) {
    overflow: hidden;
  }

  :global(.app-shell) {
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden;
  }

  :global(main#main-content) {
    flex: 1 1 auto;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
</style>
