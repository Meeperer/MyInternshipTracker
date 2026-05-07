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
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: block;
    overflow: visible;
  }

  :global(html),
  :global(body) {
    overflow: hidden;
  }

  :global(.app-shell) {
    min-height: 100dvh;
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden;
  }

  :global(main#main-content) {
    flex: 1 1 auto;
    display: block;
    height: 100dvh;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  @media (max-width: 980px) {
    :global(.app-shell) {
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
    }

    :global(main#main-content) {
      height: 100%;
      min-height: 0;
      overflow: auto;
    }
  }
</style>
