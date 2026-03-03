<script>
  import { isAuthenticated } from '$stores/auth.js';
  import { journal } from '$stores/journal.js';
  import { goto } from '$app/navigation';
  import AuthShell from '$components/AuthShell.svelte';
  import Dashboard from '$components/Dashboard.svelte';

  let fetched = false;
  $effect(() => {
    if ($isAuthenticated && !fetched) {
      fetched = true;
      const now = new Date();
      journal.fetchMonth(now.getFullYear(), now.getMonth() + 1);
    }
  });

  function handleNavigateToDate() {
    goto('/calendar');
  }
</script>

<AuthShell>
  <Dashboard onNavigateToDate={handleNavigateToDate} />
</AuthShell>
