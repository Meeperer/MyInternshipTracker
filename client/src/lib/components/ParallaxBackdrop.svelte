<script>
  import { onMount } from 'svelte';

  let offset = $state(0);
  let progress = $state(0);

  function getWindowScrollTop() {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  onMount(() => {
    if (typeof window === 'undefined') return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let currentHost = null;
    let frame = 0;

    const updateBackdrop = () => {
      frame = 0;

      if (motionQuery.matches) {
        offset = 0;
        progress = 0;
        return;
      }

      const host = document.querySelector('main#main-content');
      const top = host ? host.scrollTop : getWindowScrollTop();
      const max = host
        ? Math.max(host.scrollHeight - host.clientHeight, 1)
        : Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);

      offset = Math.min(top, 1400);
      progress = Math.min(top / max, 1);
    };

    const queueUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateBackdrop);
    };

    const connectHost = () => {
      const nextHost = document.querySelector('main#main-content');
      if (nextHost === currentHost) return;

      if (currentHost) {
        currentHost.removeEventListener('scroll', queueUpdate);
      }

      currentHost = nextHost;

      if (currentHost) {
        currentHost.addEventListener('scroll', queueUpdate, { passive: true });
      }

      updateBackdrop();
    };

    const observer = new MutationObserver(connectHost);
    const handleMotionChange = () => updateBackdrop();

    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', queueUpdate, { passive: true });

    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', handleMotionChange);
    } else {
      motionQuery.addListener(handleMotionChange);
    }

    connectHost();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', queueUpdate);

      if (currentHost) {
        currentHost.removeEventListener('scroll', queueUpdate);
      }

      if (typeof motionQuery.removeEventListener === 'function') {
        motionQuery.removeEventListener('change', handleMotionChange);
      } else {
        motionQuery.removeListener(handleMotionChange);
      }

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  });
</script>

<div
  class="parallax-backdrop"
  style={`--backdrop-offset: ${offset}px; --backdrop-progress: ${progress};`}
  aria-hidden="true"
>
  <span class="backdrop-plane backdrop-plane-a"></span>
  <span class="backdrop-plane backdrop-plane-b"></span>
  <span class="backdrop-plane backdrop-plane-c"></span>
  <span class="backdrop-line backdrop-line-a"></span>
  <span class="backdrop-line backdrop-line-b"></span>
  <span class="backdrop-line backdrop-line-c"></span>
  <span class="backdrop-ring backdrop-ring-a"></span>
  <span class="backdrop-ring backdrop-ring-b"></span>
</div>

<style>
  .parallax-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .backdrop-plane,
  .backdrop-line,
  .backdrop-ring {
    position: absolute;
    border-color: rgba(190, 53, 25, 0.08);
  }

  .backdrop-plane {
    border: 1px solid rgba(190, 53, 25, 0.08);
    background: rgba(255, 255, 255, 0.22);
    border-radius: 14px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  }

  .backdrop-plane-a {
    top: 8rem;
    left: -10rem;
    width: min(30rem, 34vw);
    height: 20rem;
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.025), 0) rotate(-7deg);
  }

  .backdrop-plane-b {
    top: 24rem;
    right: -12rem;
    width: min(38rem, 38vw);
    height: 22rem;
    transform: translate3d(0, calc(var(--backdrop-offset) * -0.03), 0) rotate(8deg);
  }

  .backdrop-plane-c {
    bottom: 8rem;
    left: 24%;
    width: min(22rem, 26vw);
    height: 11rem;
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.02), 0) rotate(-4deg);
  }

  .backdrop-line {
    height: 1px;
    background: rgba(190, 53, 25, 0.1);
  }

  .backdrop-line-a {
    top: 9.5rem;
    left: 0;
    right: 0;
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.015), 0);
  }

  .backdrop-line-b {
    top: 35rem;
    left: 10%;
    right: 5%;
    transform: translate3d(0, calc(var(--backdrop-offset) * -0.02), 0);
  }

  .backdrop-line-c {
    bottom: 12rem;
    left: 0;
    right: 16%;
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.012), 0);
  }

  .backdrop-ring {
    border: 1px solid rgba(190, 53, 25, 0.08);
    border-radius: 999px;
    background: transparent;
  }

  .backdrop-ring-a {
    top: 6rem;
    right: 18%;
    width: 11rem;
    height: 11rem;
    transform: translate3d(0, calc(var(--backdrop-offset) * -0.05), 0);
  }

  .backdrop-ring-b {
    bottom: 5rem;
    right: -3rem;
    width: 16rem;
    height: 16rem;
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.04), 0);
  }

  @media (max-width: 900px) {
    .backdrop-plane-b,
    .backdrop-ring-b {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .backdrop-plane-a,
    .backdrop-plane-c,
    .backdrop-ring-a {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop-plane,
    .backdrop-line,
    .backdrop-ring {
      transform: none !important;
    }
  }
</style>
