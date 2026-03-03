<script>
  import { auth, isAuthenticated, isLoading } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let showBranding = $state(true);
  let fadeOut = $state(false);

  $effect(() => {
    if (!$isLoading) {
      fadeOut = true;
      setTimeout(() => {
        goto($isAuthenticated ? '/dashboard' : '/login');
      }, 600);
    }
  });
</script>

<div class="splash" class:fade-out={fadeOut}>
  <div class="splash-content">
    <h1 class="splash-title">Internship Tracker</h1>
    <div class="splash-line"></div>
    <p class="splash-tagline">Your journey, tracked with intention</p>
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    z-index: 9999;
    transition: opacity 0.5s var(--ease-out);
  }

  .splash.fade-out {
    opacity: 0;
    pointer-events: none;
  }

  .splash-content {
    text-align: center;
    animation: splashIn 0.6s var(--ease-out) both;
  }

  .splash-title {
    font-family: var(--font-display);
    font-size: clamp(2rem, 6vw, 3.5rem);
    color: var(--red);
    margin-bottom: 0.75rem;
  }

  .splash-line {
    width: 48px;
    height: 2px;
    background: var(--red);
    margin: 0 auto 0.75rem;
    animation: lineGrow 0.8s 0.3s var(--ease-out) both;
  }

  .splash-tagline {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--dark-soft);
    animation: taglineIn 0.5s 0.4s var(--ease-out) both;
  }

  @keyframes splashIn {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes lineGrow {
    from { width: 0; opacity: 0; }
    to { width: 48px; opacity: 1; }
  }

  @keyframes taglineIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
