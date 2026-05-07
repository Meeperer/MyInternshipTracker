<script>
  import { isAuthenticated, isLoading } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let landingEl = $state(null);
  let gsapApi = null;
  let advancing = $state(false);
  let ready = $derived(!$isLoading);

  function destination() {
    return $isAuthenticated ? '/dashboard' : '/login';
  }

  function advance(event) {
    if (event?.type === 'keydown') {
      const allowedKeys = ['Enter', ' ', 'ArrowDown', 'PageDown'];
      if (!allowedKeys.includes(event.key)) return;
    }

    if (advancing || !ready) return;
    advancing = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!gsapApi || prefersReducedMotion || !landingEl) {
      goto(destination());
      return;
    }

    gsapApi.to(landingEl, {
      autoAlpha: 0,
      y: -8,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => goto(destination())
    });
  }

  onMount(() => {
    const listeners = [
      ['wheel', advance, { passive: true }],
      ['touchstart', advance, { passive: true }],
      ['pointerdown', advance],
      ['keydown', advance]
    ];

    listeners.forEach(([eventName, handler, options]) => {
      window.addEventListener(eventName, handler, options);
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
      import('gsap').then(({ gsap }) => {
        gsapApi = gsap;
        if (!landingEl) return;

        gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.32 } })
          .from('.landing-kicker', { autoAlpha: 0, y: 6 })
          .from('.landing-title', { autoAlpha: 0, y: 10, duration: 0.38 }, '-=0.2')
          .from('.landing-rule', { scaleX: 0, transformOrigin: 'left center', duration: 0.24 }, '-=0.18')
          .from('.landing-signal, .landing-entry-button', { autoAlpha: 0, y: 6, stagger: 0.04 }, '-=0.12')
          .from('.landing-shape', { autoAlpha: 0, scale: 0.96, stagger: 0.035, duration: 0.28 }, '-=0.24');
      }).catch(() => {
        gsapApi = null;
      });
    }

    return () => {
      listeners.forEach(([eventName, handler, options]) => {
        window.removeEventListener(eventName, handler, options);
      });
    };
  });
</script>

<svelte:head>
  <title>JOURNAL by lord</title>
  <meta name="description" content="Journal workspace by lord." />
</svelte:head>

<main class="landing-page" bind:this={landingEl} aria-busy={!ready}>
  <section class="landing-stage" aria-labelledby="landing-title">
    <div class="landing-frame">
      <p class="landing-kicker">by lord</p>
      <h1 id="landing-title" class="landing-title">JOURNAL</h1>
      <div class="landing-rule" aria-hidden="true"></div>

      <div class="landing-signals" aria-label="Workspace modules">
        <span class="landing-signal">calendar</span>
        <span class="landing-signal">entries</span>
        <span class="landing-signal">hours</span>
      </div>

      <button class="landing-entry-button" type="button" onclick={advance} disabled={!ready || advancing}>
        <span>{advancing ? 'Opening' : ready ? 'Enter' : 'Loading'}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" />
        </svg>
      </button>
    </div>

    <div class="landing-crop-panel" aria-hidden="true">
      <span class="landing-shape shape-one"></span>
      <span class="landing-shape shape-two"></span>
      <span class="landing-shape shape-three"></span>
      <span class="landing-shape shape-four"></span>
      <svg class="landing-botanical" width="380" height="380" viewBox="0 0 380 380">
        <path d="M190 338V72" />
        <path d="M190 144c-37-38-76-45-112-28 21 40 56 58 112 28Z" />
        <path d="M190 203c48-52 93-58 134-36-26 50-68 70-134 36Z" />
        <path d="M190 276c-35-35-69-42-100-28 19 38 51 54 100 28Z" />
      </svg>
    </div>
  </section>
</main>

<style>
  .landing-page {
    min-height: 100vh;
    background:
      linear-gradient(rgba(248, 239, 212, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(248, 239, 212, 0.07) 1px, transparent 1px),
      var(--canopy);
    background-size: 38px 38px, 38px 38px, auto;
    color: var(--cream);
    overflow: hidden;
  }

  .landing-stage {
    position: relative;
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.56fr);
    align-items: center;
    gap: clamp(1rem, 4vw, 3.5rem);
    padding: clamp(1rem, 3vw, 2.5rem);
    isolation: isolate;
  }

  .landing-frame {
    position: relative;
    z-index: 2;
    width: 100%;
    margin: 0;
    padding: clamp(1.25rem, 4vw, 3rem) 0;
  }

  .landing-kicker {
    margin: 0;
    font-family: var(--font-ui);
    font-size: clamp(0.72rem, 1vw, 0.9rem);
    font-weight: 900;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--lichen);
  }

  .landing-title {
    margin: 0.25rem 0 0;
    color: var(--cream);
    font-family: var(--font-display);
    font-size: clamp(4.4rem, 17vw, 15rem);
    line-height: 0.8;
    letter-spacing: 0;
  }

  .landing-rule {
    width: min(100%, 58rem);
    height: 8px;
    margin: clamp(0.9rem, 2vw, 1.4rem) 0 0;
    background: var(--lichen);
  }

  .landing-signals {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .landing-signal {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid rgba(248, 239, 212, 0.34);
    background: rgba(248, 239, 212, 0.08);
    color: var(--cream);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .landing-entry-button {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 3rem;
    margin-top: clamp(1.2rem, 3vw, 2rem);
    padding: 0.75rem 1rem;
    border: 2px solid var(--cream);
    border-radius: 6px;
    background: var(--leaf);
    color: var(--cream);
    box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.22);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: transform 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out), background 0.16s var(--ease-out);
  }

  .landing-entry-button:hover:not(:disabled),
  .landing-entry-button:focus-visible {
    transform: translate(-2px, -2px);
    box-shadow: 7px 7px 0 rgba(0, 0, 0, 0.26);
    background: var(--moss);
  }

  .landing-entry-button:active:not(:disabled) {
    transform: translate(0, 0);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.2);
  }

  .landing-entry-button:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .landing-crop-panel {
    position: relative;
    z-index: 1;
    min-height: min(74vh, 34rem);
    border: 2px solid rgba(248, 239, 212, 0.18);
    background: var(--leaf);
    overflow: hidden;
  }

  .landing-botanical {
    position: absolute;
    right: -4rem;
    bottom: -3rem;
    width: min(34vw, 24rem);
    height: auto;
    color: rgba(216, 227, 184, 0.7);
    fill: none;
    stroke: currentColor;
    stroke-width: 8;
    stroke-linecap: square;
    stroke-linejoin: miter;
    pointer-events: none;
  }

  .landing-shape {
    position: absolute;
    display: block;
    background: var(--lichen);
  }

  .shape-one {
    left: 12%;
    top: 12%;
    width: 7.2rem;
    height: 4.4rem;
    border-radius: 68% 32% 61% 39%;
    transform: rotate(-18deg);
  }

  .shape-two {
    right: 12%;
    top: 18%;
    width: 5.8rem;
    height: 8.5rem;
    border-radius: 56% 44% 62% 38%;
    background: var(--moss);
    transform: rotate(28deg);
  }

  .shape-three {
    left: 18%;
    bottom: 18%;
    width: 9.2rem;
    height: 9.2rem;
    border-radius: 50%;
    background: var(--canopy-deep);
  }

  .shape-four {
    right: 28%;
    bottom: 28%;
    width: 4rem;
    height: 4rem;
    border-radius: 42% 58% 46% 54%;
    background: var(--cream);
    transform: rotate(18deg);
  }

  @media (max-width: 720px) {
    .landing-stage {
      grid-template-columns: 1fr;
      align-content: center;
      align-items: stretch;
      gap: 1rem;
      padding: 1rem;
    }

    .landing-frame {
      padding: 0;
    }

    .landing-title {
      font-size: clamp(3.15rem, 17vw, 4.75rem);
    }

    .landing-rule {
      height: 6px;
    }

    .landing-botanical {
      right: -5rem;
      bottom: -3rem;
      width: 19rem;
    }

    .landing-crop-panel {
      min-height: 12rem;
      order: -1;
    }
  }

  @media (max-width: 420px) {
    .landing-title {
      font-size: clamp(3rem, 16vw, 4.1rem);
    }

    .landing-signals {
      gap: 0.4rem;
    }

    .landing-signal {
      min-height: 1.85rem;
      padding-inline: 0.52rem;
      font-size: 0.64rem;
    }

    .landing-entry-button {
      width: 100%;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing-entry-button {
      transition: none;
    }
  }
</style>
