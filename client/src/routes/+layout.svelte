<script>
  import '../app.css';
  import Toast from '$components/Toast.svelte';
  import { auth } from '$stores/auth.js';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(() => {
    auth.init();
  });
</script>

{@render children()}
<Toast />
