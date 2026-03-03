<script>
  import { isAuthenticated, isLoading } from '$stores/auth.js';
  import { progress } from '$stores/progress.js';
  import { goto } from '$app/navigation';
  import Nav from './Nav.svelte';

  let { children } = $props();

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) {
      goto('/login');
    }
  });

  let fetched = false;
  $effect(() => {
    if ($isAuthenticated && !fetched) {
      fetched = true;
      progress.fetch();
    }
  });
</script>

{#if $isLoading}
  <div class="auth-loading">
    <div class="auth-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if $isAuthenticated}
  <div class="app-shell">
    <Nav />
    <main id="main-content" class="page-enter">
      {@render children()}
    </main>
  </div>
{/if}

<style>
  .auth-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-height: 100vh;
    color: var(--dark-soft);
  }

  .auth-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--red);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    width: 100%;
  }

  @media (max-width: 768px) {
    main {
      min-height: 50vh;
    }
  }

  @media (max-width: 480px) {
    main {
      min-height: 40vh;
    }
  }
</style>
