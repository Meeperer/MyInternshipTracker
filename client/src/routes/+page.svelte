<script>
  import LoadingScreen from '$lib/components/LoadingScreen.svelte';
  import { auth, isAuthenticated, isLoading } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const LOADING_DURATION_MS = 10_000;

  let loadingComplete = $state(false);
  let progress = $state(0);

  onMount(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      progress = Math.min((elapsed / LOADING_DURATION_MS) * 100, 100);
      if (elapsed >= LOADING_DURATION_MS) {
        clearInterval(interval);
        loadingComplete = true;
      }
    }, 50);
    return () => clearInterval(interval);
  });

  $effect(() => {
    const canNavigate = !$isLoading && loadingComplete;
    if (canNavigate) {
      if ($isAuthenticated) {
        goto('/dashboard');
      } else {
        goto('/login');
      }
    }
  });
</script>

<LoadingScreen progress={progress} durationSeconds={10} />
