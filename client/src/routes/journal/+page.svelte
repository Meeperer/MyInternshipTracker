<script>
  import { auth, isAuthenticated, isLoading } from '$stores/auth.js';
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import { goto } from '$app/navigation';
  import Nav from '$components/Nav.svelte';
  import JournalList from '$components/JournalList.svelte';
  import DayModal from '$components/DayModal.svelte';

  let selectedDate = $state(null);

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

  function handleDateSelect(date) {
    selectedDate = date;
  }

  function closeModal() {
    selectedDate = null;
    progress.fetch();
    const now = new Date();
    journal.fetchMonth(now.getFullYear(), now.getMonth() + 1);
  }
</script>

{#if $isLoading}
  <div class="loading-screen">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>
{:else if $isAuthenticated}
  <div class="app-shell">
    <Nav />

    <main id="main-content">
      <JournalList onDateSelect={handleDateSelect} />
    </main>
  </div>

  {#if selectedDate}
    <DayModal date={selectedDate} onClose={closeModal} />
  {/if}
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

  main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  @media (max-width: 992px) {
    main {
      padding: 0;
    }
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

