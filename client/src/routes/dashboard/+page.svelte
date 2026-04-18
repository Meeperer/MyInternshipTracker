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
  <Dashboard onNavigateToDate={handleNavigateToDate} />
</AuthShell>
