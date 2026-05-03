<script>
  import AuthShell from '$components/AuthShell.svelte';
  import Dashboard from '$components/Dashboard.svelte';
</script>

<AuthShell>
  <div class="dashboard-page-shell">
    <Dashboard />
  </div>
</AuthShell>

<style>
  .dashboard-page-shell {
    flex: 1 1 auto;
    width: 100%;
    min-height: 100%;
    min-width: 0;
    display: block;
    overflow: visible;
  }

  :global(html),
  :global(body) {
    overflow: auto;
  }

  :global(.app-shell) {
    min-height: 100dvh;
    height: auto;
    max-height: none;
    overflow: visible;
  }

  :global(main#main-content) {
    flex: 1 1 auto;
    display: block;
    height: auto;
    min-height: 0;
    min-width: 0;
    overflow: visible;
  }
</style>
