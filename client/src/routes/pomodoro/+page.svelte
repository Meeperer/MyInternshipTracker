<script>
  import { auth, isAuthenticated, isLoading } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import Nav from '$components/Nav.svelte';
  import Timer from '$components/Timer.svelte';

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) {
      goto('/login');
    }
  });
</script>

{#if $isLoading}
  <div class="loading-screen">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if $isAuthenticated}
  <div class="app-shell">
    <Nav />

    <main id="main-content" class="pomodoro-main">
      <div class="pomodoro-wrap">
        <Timer />
      </div>
    </main>
  </div>
{/if}

<style>
  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-height: 100vh;
    color: var(--dark-soft);
  }
  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--red);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .pomodoro-main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
    min-height: 60vh;
  }

  .pomodoro-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    justify-content: center;
  }

  @media (max-width: 992px) {
    .pomodoro-main {
      padding: 0;
    }
  }

  @media (max-width: 768px) {
    .pomodoro-main {
      min-height: 50vh;
    }
  }

  @media (max-width: 480px) {
    .pomodoro-main {
      min-height: 40vh;
    }
  }
</style>

