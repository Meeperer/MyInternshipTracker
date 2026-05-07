<script>
  import { isAuthenticated, isLoading } from '$stores/auth.js';
  import { progress } from '$stores/progress.js';
  import { goto } from '$app/navigation';
  import Nav from './Nav.svelte';
  import ParallaxBackdrop from './ParallaxBackdrop.svelte';

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
    <ParallaxBackdrop />
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
    background: var(--canopy);
    color: var(--cream);
  }

  .auth-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(248, 239, 212, 0.34);
    border-top-color: var(--lichen);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .app-shell {
    position: relative;
    min-height: 100dvh;
    height: 100dvh;
    max-height: 100dvh;
    display: grid;
    grid-template-columns: 16rem minmax(0, 1fr);
    background: var(--bg);
    isolation: isolate;
    overflow: hidden;
  }

  main {
    position: relative;
    z-index: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    width: 100%;
    height: 100dvh;
  }

  @media (max-width: 980px) {
    .app-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
    }

    main {
      height: 100%;
      min-height: 0;
      overflow: auto;
      padding-bottom: calc(4.9rem + env(safe-area-inset-bottom, 0px));
      scrollbar-gutter: stable;
    }
  }

  @media (max-width: 480px) {
    main {
      min-height: 40vh;
      padding-bottom: calc(4.65rem + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
