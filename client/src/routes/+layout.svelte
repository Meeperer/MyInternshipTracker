<script>
  import '../app.css';
  import Toast from '$components/Toast.svelte';
  import { auth, isAuthenticated } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    auth.init();

    function handleGlobalKeys(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        switch (e.key) {
          case '1': e.preventDefault(); goto('/dashboard'); break;
          case '2': e.preventDefault(); goto('/calendar'); break;
          case '3': e.preventDefault(); goto('/pomodoro'); break;
          case '4': e.preventDefault(); goto('/journal'); break;
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeys);
    return () => document.removeEventListener('keydown', handleGlobalKeys);
  });
</script>

{@render children()}
<Toast />
