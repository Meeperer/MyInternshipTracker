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
  <img class="botanical-cutout backdrop-leaf backdrop-leaf-a" src="/plants/fern-branch.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <img class="botanical-cutout backdrop-leaf backdrop-leaf-b" src="/plants/palm-fan.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <img class="botanical-cutout backdrop-leaf backdrop-leaf-c" src="/plants/fern-canopy.png" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <span class="backdrop-line backdrop-line-a"></span>
  <span class="backdrop-line backdrop-line-b"></span>
  <span class="backdrop-line backdrop-line-c"></span>
</div>

<style>
  .parallax-backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .backdrop-leaf,
  .backdrop-line {
    position: absolute;
    opacity: 0.055;
    filter: saturate(0.78) contrast(1.02);
  }

  .backdrop-leaf-a {
    top: 8rem;
    left: -8rem;
    width: min(28rem, 32vw);
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.025), 0);
  }

  .backdrop-leaf-b {
    top: 24rem;
    right: -15rem;
    width: min(40rem, 42vw);
    transform: translate3d(0, calc(var(--backdrop-offset) * -0.03), 0);
  }

  .backdrop-leaf-c {
    bottom: 7rem;
    left: 24%;
    width: min(24rem, 28vw);
    transform: translate3d(0, calc(var(--backdrop-offset) * 0.02), 0);
  }

  .backdrop-line {
    height: 1px;
    background: rgba(11, 110, 58, 0.1);
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

  @media (max-width: 900px) {
    .backdrop-leaf-b {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .backdrop-leaf-a,
    .backdrop-leaf-c {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop-leaf,
    .backdrop-line {
      transform: none !important;
    }
  }
</style>
