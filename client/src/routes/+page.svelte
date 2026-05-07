<script>
  import { isAuthenticated, isLoading } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let landingEl = $state(null);
  let stageEl = $state(null);
  let gsapApi = null;
  let progress = $state(0);
  let pointerX = $state(0);
  let pointerY = $state(0);
  let entering = $state(false);
  let reducedMotion = $state(false);

  const ready = $derived(!$isLoading);
  const destination = $derived($isAuthenticated ? '/dashboard' : '/login');

  const greenLeaves = Array.from({ length: 40 }, (_, index) => ({
    src: '/plants/green-leaf-stemless.png?v=1',
    className: `leaf-layer leaf-layer-${String(index + 1).padStart(2, '0')}`
  }));

  function clamp(value, min = 0, max = 1) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPx(value) {
    return `${value.toFixed(2)}px`;
  }

  function formatVw(value) {
    return `${value.toFixed(3)}vw`;
  }

  function formatVh(value) {
    return `${value.toFixed(3)}vh`;
  }

  function formatDeg(value) {
    return `${value.toFixed(3)}deg`;
  }

  const motionVars = $derived.by(() => {
    const brandReveal = clamp((progress - 0.72) / 0.1) * (1 - clamp((progress - 0.89) / 0.08));
    const leafDepth = progress * 1.2;

    return [
      `--scroll-progress: ${progress.toFixed(4)}`,
      `--meter-width: ${(progress * 100).toFixed(2)}%`,
      `--intro-opacity: ${brandReveal.toFixed(4)}`,
      `--meter-opacity: ${(1 - clamp((progress - 0.86) / 0.1)).toFixed(4)}`,
      `--open-left: ${formatVw(-progress * 34)}`,
      `--open-right: ${formatVw(progress * 34)}`,
      `--open-left-wide: ${formatVw(-progress * 82)}`,
      `--open-right-wide: ${formatVw(progress * 82)}`,
      `--open-left-xl: ${formatVw(-progress * 145)}`,
      `--open-right-xl: ${formatVw(progress * 145)}`,
      `--open-top: ${formatVh(-progress * 16)}`,
      `--open-bottom: ${formatVh(progress * 18)}`,
      `--open-up-wide: ${formatVh(-progress * 36)}`,
      `--open-down-wide: ${formatVh(progress * 36)}`,
      `--open-up-xl: ${formatVh(-progress * 72)}`,
      `--open-down-xl: ${formatVh(progress * 86)}`,
      `--cover-opacity: ${(1 - clamp((progress - 0.62) / 0.2) * 0.2).toFixed(4)}`,
      `--field-rise: ${formatPx(progress * 48)}`,
      `--field-rise-neg: ${formatPx(progress * -48)}`,
      `--pointer-x-sm: ${formatPx(pointerX * 9)}`,
      `--pointer-x-sm-neg: ${formatPx(pointerX * -9)}`,
      `--pointer-y-sm: ${formatPx(pointerY * 8)}`,
      `--pointer-x-md: ${formatPx(pointerX * 20)}`,
      `--pointer-x-md-neg: ${formatPx(pointerX * -20)}`,
      `--pointer-y-md: ${formatPx(pointerY * 16)}`,
      `--pointer-x-lg: ${formatPx(pointerX * 34)}`,
      `--pointer-y-lg: ${formatPx(pointerY * 24)}`,
      `--left-rot: ${formatDeg(-8 - progress * 13 + pointerX * 2.5)}`,
      `--left-rot-soft: ${formatDeg((-8 - progress * 13 + pointerX * 2.5) * 0.72)}`,
      `--right-rot: ${formatDeg(8 + progress * 13 + pointerX * 2.5)}`,
      `--right-rot-soft: ${formatDeg((8 + progress * 13 + pointerX * 2.5) * 0.7)}`,
      `--top-rot: ${formatDeg(progress * 8 + pointerX * 1.8)}`,
      `--near-scale: ${(1 + leafDepth * 0.08).toFixed(4)}`
    ].join(';');
  });

  function updateScrollProgress() {
    if (!landingEl) return;

    const bounds = landingEl.getBoundingClientRect();
    const scrollable = Math.max(landingEl.offsetHeight - window.innerHeight, 1);
    progress = clamp(-bounds.top / scrollable);
  }

  function updatePointer(event) {
    if (!stageEl) return;
    const rect = stageEl.getBoundingClientRect();
    pointerX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    pointerY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  }

  function resetPointer() {
    pointerX = 0;
    pointerY = 0;
  }

  function enterApp() {
    if (!ready || entering) return;

    entering = true;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let routed = false;

    const finish = () => {
      if (routed) return;
      routed = true;
      goto(destination);
    };

    if (!gsapApi || prefersReducedMotion || !landingEl) {
      finish();
      return;
    }

    const fallback = window.setTimeout(finish, 760);

    gsapApi.timeline({
      onComplete: () => {
        window.clearTimeout(fallback);
        finish();
      }
    })
      .to('.landing-brand-lockup', {
        autoAlpha: 0,
        y: -8,
        duration: 0.16,
        ease: 'power2.out'
      })
      .to('.landing-transition-shade', {
        scaleY: 1,
        duration: 0.34,
        ease: 'power3.inOut'
      }, '-=0.08')
      .to(landingEl, {
        autoAlpha: 0,
        duration: 0.08,
        ease: 'power2.out'
      }, '-=0.02');
  }

  onMount(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedMotion = prefersReducedMotion;
    const previousScrollRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    let frame = 0;

    function queueScrollUpdate() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateScrollProgress();
      });
    }

    updateScrollProgress();
    window.addEventListener('scroll', queueScrollUpdate, { passive: true });
    window.addEventListener('resize', queueScrollUpdate);
    window.addEventListener('pointermove', updatePointer, { passive: true });
    window.addEventListener('pointerleave', resetPointer);

    if (!prefersReducedMotion) {
      import('gsap').then(({ gsap }) => {
        gsapApi = gsap;
        gsap.timeline({ defaults: { duration: 0.32, ease: 'power2.out' } })
          .from('.landing-brand-lockup h1', {
            autoAlpha: 0,
            y: 8,
            clearProps: 'opacity,visibility,transform'
          })
          .from('.landing-guide-line', {
            scaleX: 0,
            transformOrigin: 'left center',
            duration: 0.24,
            clearProps: 'transform'
          }, '-=0.14')
          .from('.landing-scroll-meter', {
            autoAlpha: 0,
            y: 8,
            duration: 0.24,
            clearProps: 'opacity,visibility,transform'
          }, '-=0.12');
      }).catch(() => {
        gsapApi = null;
      });
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener('scroll', queueScrollUpdate);
      window.removeEventListener('resize', queueScrollUpdate);
      window.removeEventListener('pointermove', updatePointer);
      window.removeEventListener('pointerleave', resetPointer);
    };
  });

  $effect(() => {
    if (!ready || entering) return;
    if (!reducedMotion && progress < 0.965) return;

    const delay = reducedMotion ? 700 : 80;
    const timeout = window.setTimeout(() => enterApp(), delay);

    return () => {
      window.clearTimeout(timeout);
    };
  });
</script>

<svelte:head>
  <title>JOURNAL by LORD</title>
  <meta name="description" content="A botanical journal workspace by lord." />
</svelte:head>

<main class="landing-page" bind:this={landingEl} style={motionVars} aria-busy={!ready}>
  <section class="landing-sticky-stage" bind:this={stageEl} aria-labelledby="landing-title">
    <div class="leaf-field" aria-hidden="true">
      {#each greenLeaves as leaf}
        <img
          class={`landing-leaf ${leaf.className}`}
          src={leaf.src}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
        />
      {/each}
    </div>

    <div class="landing-grain" aria-hidden="true"></div>

    <div class="landing-brand-lockup">
      <h1 id="landing-title" aria-label="JOURNAL by LORD">JOURNAL <span class="landing-title-by">by LORD</span></h1>
      <div class="landing-guide-line" aria-hidden="true"></div>
    </div>

    <div class="landing-transition-shade" aria-hidden="true"></div>

    <div class="landing-scroll-meter" aria-hidden="true">
      <span class="meter-track"><span class="meter-fill"></span></span>
      <span class="meter-label">scroll</span>
    </div>
  </section>
</main>

<style>
  .landing-page {
    --scroll-progress: 0;
    --meter-width: 0%;
    --intro-opacity: 1;
    --meter-opacity: 1;
    --open-left: 0vw;
    --open-right: 0vw;
    --open-left-wide: 0vw;
    --open-right-wide: 0vw;
    --open-left-xl: 0vw;
    --open-right-xl: 0vw;
    --open-top: 0vh;
    --open-bottom: 0vh;
    --open-up-wide: 0vh;
    --open-down-wide: 0vh;
    --open-up-xl: 0vh;
    --open-down-xl: 0vh;
    --cover-opacity: 1;
    --field-rise: 0px;
    --field-rise-neg: 0px;
    --pointer-x-sm: 0px;
    --pointer-x-sm-neg: 0px;
    --pointer-y-sm: 0px;
    --pointer-x-md: 0px;
    --pointer-x-md-neg: 0px;
    --pointer-y-md: 0px;
    --pointer-x-lg: 0px;
    --pointer-y-lg: 0px;
    --left-rot: -8deg;
    --left-rot-soft: -5.76deg;
    --right-rot: 8deg;
    --right-rot-soft: 5.6deg;
    --top-rot: 0deg;
    --near-scale: 1;
    min-height: 430vh;
    background:
      linear-gradient(rgba(36, 24, 15, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(36, 24, 15, 0.045) 1px, transparent 1px),
      var(--bg);
    background-size: 34px 34px, 34px 34px, auto;
    color: var(--cream);
  }

  .landing-sticky-stage {
    position: sticky;
    top: 0;
    min-height: 100dvh;
    display: grid;
    place-items: center;
    overflow: hidden;
    isolation: isolate;
    background:
      linear-gradient(rgba(248, 239, 212, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(248, 239, 212, 0.07) 1px, transparent 1px),
      var(--canopy);
    background-size: 32px 32px, 32px 32px, auto;
    border-bottom: 2px solid rgba(36, 24, 15, 0.82);
  }

  .landing-grain {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgba(248, 239, 212, 0.08) 1px, transparent 1px) 50% 0 / 9rem 100%,
      radial-gradient(circle at 52% 44%, rgba(216, 227, 184, 0.13), transparent 34rem);
    opacity: 0.9;
  }

  .leaf-field {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    transform: translate3d(0, var(--field-rise-neg), 0);
  }

  .landing-leaf {
    position: absolute;
    z-index: 3;
    display: block;
    width: var(--leaf-width, clamp(16rem, 30vw, 42rem));
    height: auto;
    pointer-events: none;
    user-select: none;
    object-fit: contain;
    opacity: var(--cover-opacity);
    transform-origin: var(--leaf-origin-x, center) var(--leaf-origin-y, bottom);
    clip-path: none;
    filter:
      drop-shadow(1px 0 0 rgba(3, 46, 26, 0.62))
      drop-shadow(-1px 0 0 rgba(3, 46, 26, 0.42))
      drop-shadow(0 1px 0 rgba(3, 46, 26, 0.48))
      drop-shadow(0 -1px 0 rgba(242, 234, 199, 0.4))
      drop-shadow(0 10px 14px rgba(2, 18, 11, 0.18))
      saturate(var(--leaf-saturation, 1.04))
      brightness(var(--leaf-brightness, 0.96));
    will-change: transform, opacity;
  }

  .leaf-layer-01 {
    left: -18vw;
    top: -25vh;
    --leaf-width: clamp(24rem, 42vw, 54rem);
    --trim-bottom: 30%;
    transform:
      translate3d(calc(var(--open-left-xl) + var(--pointer-x-lg)), calc(var(--open-up-xl) + var(--pointer-y-md)), 0)
      rotate(-48deg)
      scale(var(--near-scale));
  }

  .leaf-layer-02 {
    left: 12vw;
    top: -32vh;
    --leaf-width: clamp(25rem, 45vw, 58rem);
    --trim-bottom: 30%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-sm)), calc(var(--open-up-xl) + var(--pointer-y-sm)), 0)
      rotate(-10deg)
      scale(var(--near-scale));
  }

  .leaf-layer-03 {
    right: -17vw;
    top: -24vh;
    --leaf-width: clamp(24rem, 42vw, 54rem);
    --trim-bottom: 30%;
    transform:
      translate3d(calc(var(--open-right-xl) + var(--pointer-x-md)), calc(var(--open-up-xl) + var(--pointer-y-md)), 0)
      rotate(43deg);
  }

  .leaf-layer-04 {
    left: -24vw;
    top: 7vh;
    --leaf-width: clamp(26rem, 48vw, 62rem);
    --trim-bottom: 26%;
    transform:
      translate3d(calc(var(--open-left-xl) + var(--pointer-x-md)), calc(var(--open-top) + var(--pointer-y-sm)), 0)
      rotate(72deg);
  }

  .leaf-layer-05 {
    left: 22vw;
    top: 2vh;
    --leaf-width: clamp(24rem, 43vw, 56rem);
    --trim-bottom: 24%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-sm-neg)), calc(var(--open-up-xl) + var(--pointer-y-md)), 0)
      rotate(-20deg)
      scale(var(--near-scale));
  }

  .leaf-layer-06 {
    right: -24vw;
    top: 8vh;
    --leaf-width: clamp(26rem, 47vw, 60rem);
    --trim-bottom: 26%;
    transform:
      translate3d(calc(var(--open-right-xl) + var(--pointer-x-lg)), calc(var(--open-top) + var(--pointer-y-sm)), 0)
      rotate(-72deg);
  }

  .leaf-layer-07 {
    left: -22vw;
    bottom: -28vh;
    --leaf-width: clamp(27rem, 50vw, 64rem);
    --trim-bottom: 32%;
    transform:
      translate3d(calc(var(--open-left-xl) + var(--pointer-x-lg)), calc(var(--open-down-xl) + var(--pointer-y-sm)), 0)
      rotate(-20deg);
  }

  .leaf-layer-08 {
    left: 17vw;
    bottom: -34vh;
    --leaf-width: clamp(27rem, 50vw, 64rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-left) + var(--pointer-x-sm-neg)), calc(var(--open-down-xl) + var(--pointer-y-md)), 0)
      rotate(12deg);
  }

  .leaf-layer-09 {
    right: -18vw;
    bottom: -30vh;
    --leaf-width: clamp(27rem, 49vw, 62rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-right-xl) + var(--pointer-x-md)), calc(var(--open-down-xl) + var(--pointer-y-md)), 0)
      rotate(22deg);
  }

  .leaf-layer-10 {
    left: -7vw;
    top: 28vh;
    --leaf-width: clamp(18rem, 32vw, 42rem);
    --trim-bottom: 28%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-sm)), calc(var(--open-bottom) + var(--pointer-y-sm)), 0)
      rotate(36deg);
  }

  .leaf-layer-11 {
    right: -8vw;
    top: 29vh;
    --leaf-width: clamp(18rem, 32vw, 42rem);
    --trim-bottom: 28%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-sm-neg)), calc(var(--open-bottom) + var(--pointer-y-sm)), 0)
      rotate(-34deg);
  }

  .leaf-layer-12 {
    left: 34vw;
    top: 16vh;
    --leaf-width: clamp(20rem, 34vw, 44rem);
    --trim-bottom: 24%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-md-neg)), calc(var(--open-up-wide) + var(--pointer-y-md)), 0)
      rotate(4deg);
  }

  .leaf-layer-13 {
    left: 6vw;
    top: 39vh;
    --leaf-width: clamp(18rem, 31vw, 40rem);
    --trim-bottom: 31%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-md)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(-54deg);
  }

  .leaf-layer-14 {
    right: 7vw;
    top: 40vh;
    --leaf-width: clamp(18rem, 31vw, 40rem);
    --trim-bottom: 31%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-sm)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(52deg);
  }

  .leaf-layer-15 {
    left: 26vw;
    bottom: -14vh;
    --leaf-width: clamp(18rem, 30vw, 39rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-left) + var(--pointer-x-sm-neg)), calc(var(--open-down-xl) + var(--pointer-y-sm)), 0)
      rotate(-8deg);
  }

  .leaf-layer-16 {
    right: 25vw;
    bottom: -14vh;
    --leaf-width: clamp(18rem, 30vw, 39rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-sm)), calc(var(--open-down-xl) + var(--pointer-y-sm)), 0)
      rotate(9deg);
  }

  .leaf-layer-17 {
    left: 39vw;
    top: -28vh;
    --leaf-width: clamp(20rem, 34vw, 44rem);
    --trim-bottom: 30%;
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-sm)), calc(var(--open-up-xl) + var(--pointer-y-sm)), 0)
      rotate(24deg);
  }

  .leaf-layer-18 {
    left: 49vw;
    top: -2vh;
    --leaf-width: clamp(18rem, 29vw, 38rem);
    --trim-bottom: 27%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-md)), calc(var(--open-up-wide) + var(--pointer-y-md)), 0)
      rotate(-28deg);
  }

  .leaf-layer-19 {
    left: 14vw;
    top: 12vh;
    --leaf-width: clamp(18rem, 29vw, 38rem);
    --trim-bottom: 27%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-sm-neg)), calc(var(--open-up-wide) + var(--pointer-y-md)), 0)
      rotate(28deg);
  }

  .leaf-layer-20 {
    left: -7vw;
    top: 55vh;
    --leaf-width: clamp(16rem, 28vw, 36rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-left-xl) + var(--pointer-x-sm)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(18deg);
  }

  .leaf-layer-21 {
    right: -7vw;
    top: 55vh;
    --leaf-width: clamp(16rem, 28vw, 36rem);
    --trim-bottom: 34%;
    transform:
      translate3d(calc(var(--open-right-xl) + var(--pointer-x-md)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(-18deg);
  }

  .leaf-layer-22 {
    left: 42vw;
    top: 18vh;
    --leaf-width: clamp(16rem, 27vw, 36rem);
    --trim-bottom: 25%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-sm-neg)), calc(var(--open-top) + var(--pointer-y-md)), 0)
      rotate(63deg);
  }

  .leaf-layer-23 {
    left: 3vw;
    top: -34vh;
    --leaf-width: clamp(17rem, 29vw, 38rem);
    --trim-bottom: 33%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-sm)), calc(var(--open-up-xl) + var(--pointer-y-sm)), 0)
      rotate(9deg);
  }

  .leaf-layer-24 {
    right: 3vw;
    top: -34vh;
    --leaf-width: clamp(17rem, 29vw, 38rem);
    --trim-bottom: 33%;
    transform:
      translate3d(calc(var(--open-right-wide) + var(--pointer-x-md)), calc(var(--open-up-xl) + var(--pointer-y-sm)), 0)
      rotate(-9deg);
  }

  .leaf-layer-25 {
    left: 38vw;
    bottom: -42vh;
    --leaf-width: clamp(22rem, 38vw, 50rem);
    --trim-bottom: 36%;
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-sm-neg)), calc(var(--open-down-xl) + var(--pointer-y-md)), 0)
      rotate(2deg);
  }

  .leaf-layer-26 {
    left: -14vw;
    top: 39vh;
    --leaf-width: clamp(18rem, 31vw, 40rem);
    --trim-bottom: 31%;
    transform:
      translate3d(calc(var(--open-left-xl) + var(--pointer-x-sm)), calc(var(--open-bottom) + var(--pointer-y-md)), 0)
      rotate(-72deg);
  }

  .leaf-layer-27 {
    right: -14vw;
    top: 39vh;
    --leaf-width: clamp(18rem, 31vw, 40rem);
    --trim-bottom: 31%;
    transform:
      translate3d(calc(var(--open-right-xl) + var(--pointer-x-sm-neg)), calc(var(--open-bottom) + var(--pointer-y-md)), 0)
      rotate(72deg);
  }

  .leaf-layer-28 {
    left: 30vw;
    top: 34vh;
    --leaf-width: clamp(20rem, 34vw, 44rem);
    --trim-bottom: 32%;
    transform:
      translate3d(calc(var(--open-left-wide) + var(--pointer-x-lg)), calc(var(--open-down-xl) + var(--pointer-y-md)), 0)
      rotate(180deg);
  }

  .leaf-layer-29 {
    left: 21vw;
    top: 20vh;
    --leaf-width: clamp(14rem, 24vw, 32rem);
    --leaf-brightness: 0.9;
    opacity: calc(var(--cover-opacity) * 0.62);
    transform:
      translate3d(var(--pointer-x-sm), var(--pointer-y-sm), 0)
      rotate(-38deg);
  }

  .leaf-layer-30 {
    right: 20vw;
    top: 20vh;
    --leaf-width: clamp(14rem, 24vw, 32rem);
    --leaf-brightness: 1.02;
    opacity: calc(var(--cover-opacity) * 0.6);
    transform:
      translate3d(var(--pointer-x-sm-neg), var(--pointer-y-sm), 0)
      rotate(38deg);
  }

  .leaf-layer-31 {
    left: 30vw;
    top: 45vh;
    --leaf-width: clamp(15rem, 25vw, 34rem);
    --leaf-brightness: 0.94;
    opacity: calc(var(--cover-opacity) * 0.64);
    transform:
      translate3d(var(--pointer-x-md), var(--pointer-y-md), 0)
      rotate(5deg);
  }

  .leaf-layer-32 {
    right: 29vw;
    top: 45vh;
    --leaf-width: clamp(15rem, 25vw, 34rem);
    --leaf-brightness: 1;
    opacity: calc(var(--cover-opacity) * 0.62);
    transform:
      translate3d(var(--pointer-x-md-neg), var(--pointer-y-sm), 0)
      rotate(-6deg);
  }

  .leaf-layer-33 {
    left: 7vw;
    top: 9vh;
    --leaf-width: clamp(13rem, 22vw, 30rem);
    --leaf-brightness: 1.04;
    opacity: calc(var(--cover-opacity) * 0.82);
    transform:
      translate3d(calc(var(--open-left) + var(--pointer-x-sm)), calc(var(--open-up-wide) + var(--pointer-y-md)), 0)
      rotate(74deg);
  }

  .leaf-layer-34 {
    right: 8vw;
    top: 9vh;
    --leaf-width: clamp(13rem, 22vw, 30rem);
    --leaf-brightness: 0.92;
    opacity: calc(var(--cover-opacity) * 0.84);
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-md)), calc(var(--open-up-wide) + var(--pointer-y-md)), 0)
      rotate(-74deg);
  }

  .leaf-layer-35 {
    left: 12vw;
    bottom: 4vh;
    --leaf-width: clamp(13rem, 22vw, 30rem);
    --leaf-brightness: 0.98;
    opacity: calc(var(--cover-opacity) * 0.86);
    transform:
      translate3d(calc(var(--open-left) + var(--pointer-x-sm)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(-80deg);
  }

  .leaf-layer-36 {
    right: 12vw;
    bottom: 4vh;
    --leaf-width: clamp(13rem, 22vw, 30rem);
    --leaf-brightness: 1.03;
    opacity: calc(var(--cover-opacity) * 0.84);
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-sm-neg)), calc(var(--open-down-wide) + var(--pointer-y-sm)), 0)
      rotate(80deg);
  }

  .leaf-layer-37 {
    left: 43vw;
    top: 1vh;
    --leaf-width: clamp(12rem, 20vw, 28rem);
    --leaf-brightness: 0.91;
    opacity: calc(var(--cover-opacity) * 0.64);
    transform:
      translate3d(var(--pointer-x-sm-neg), var(--pointer-y-sm), 0)
      rotate(16deg);
  }

  .leaf-layer-38 {
    left: 44vw;
    bottom: -2vh;
    --leaf-width: clamp(12rem, 20vw, 28rem);
    --leaf-brightness: 1.03;
    opacity: calc(var(--cover-opacity) * 0.64);
    transform:
      translate3d(var(--pointer-x-sm), var(--pointer-y-sm), 0)
      rotate(-166deg);
  }

  .leaf-layer-39 {
    left: -4vw;
    top: 31vh;
    --leaf-width: clamp(12rem, 21vw, 30rem);
    --leaf-brightness: 0.95;
    opacity: calc(var(--cover-opacity) * 0.9);
    transform:
      translate3d(calc(var(--open-left) + var(--pointer-x-md)), var(--pointer-y-md), 0)
      rotate(102deg);
  }

  .leaf-layer-40 {
    right: -4vw;
    top: 31vh;
    --leaf-width: clamp(12rem, 21vw, 30rem);
    --leaf-brightness: 1.01;
    opacity: calc(var(--cover-opacity) * 0.9);
    transform:
      translate3d(calc(var(--open-right) + var(--pointer-x-md-neg)), var(--pointer-y-md), 0)
      rotate(-102deg);
  }

  .landing-brand-lockup {
    position: relative;
    z-index: 4;
    width: min(100% - 2rem, 62rem);
    padding: clamp(1rem, 3vw, 2rem) 0;
    opacity: var(--intro-opacity);
    transform: translate3d(0, var(--field-rise-neg), 0);
    pointer-events: none;
  }

  .landing-brand-lockup h1 {
    display: flex;
    align-items: flex-end;
    gap: clamp(0.6rem, 1.6vw, 1.2rem);
    flex-wrap: wrap;
    margin: 0;
    color: var(--cream);
    font-family: var(--font-display);
    font-size: clamp(4rem, 18vw, 15rem);
    font-weight: 400;
    line-height: 0.78;
    letter-spacing: 0;
  }

  .landing-title-by {
    color: var(--lichen);
    font-family: var(--font-ui);
    font-size: clamp(0.76rem, 1.2vw, 1.05rem);
    font-weight: 900;
    letter-spacing: 0.2em;
    line-height: 1.15;
    transform: translateY(-0.38em);
  }

  .landing-guide-line {
    width: min(100%, 56rem);
    height: 7px;
    margin: clamp(0.85rem, 2vw, 1.35rem) 0 0;
    background: var(--lichen);
  }

  .landing-scroll-meter {
    position: absolute;
    right: clamp(1rem, 3vw, 2rem);
    bottom: clamp(1rem, 3vw, 2rem);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: rgba(248, 239, 212, 0.78);
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: var(--meter-opacity);
  }

  .landing-transition-shade {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    background: var(--canopy-deep);
    transform: scaleY(0);
    transform-origin: bottom;
  }

  .meter-track {
    width: clamp(5rem, 12vw, 8rem);
    height: 0.42rem;
    border: 1px solid rgba(248, 239, 212, 0.5);
    background: rgba(248, 239, 212, 0.1);
  }

  .meter-fill {
    display: block;
    width: var(--meter-width);
    height: 100%;
    background: var(--lichen);
  }

  @media (max-width: 760px) {
    .landing-page {
      min-height: 390vh;
    }

    .landing-sticky-stage {
      align-items: center;
      padding: 1rem;
    }

    .landing-brand-lockup {
      width: 100%;
      padding-top: 2rem;
    }

    .landing-brand-lockup h1 {
      font-size: clamp(4rem, 22vw, 6.25rem);
    }

    .landing-guide-line {
      height: 6px;
    }

    .landing-leaf {
      width: var(--leaf-width-mobile, var(--leaf-width));
    }

    .leaf-layer-01 {
      left: -58vw;
      top: -18vh;
      --leaf-width-mobile: 27rem;
    }

    .leaf-layer-02 {
      left: 1vw;
      top: -26vh;
      --leaf-width-mobile: 25rem;
    }

    .leaf-layer-03 {
      right: -60vw;
      top: -18vh;
      --leaf-width-mobile: 27rem;
    }

    .leaf-layer-04 {
      left: -92vw;
      top: 12vh;
      --leaf-width-mobile: 30rem;
    }

    .leaf-layer-05 {
      left: 11vw;
      top: 3vh;
      --leaf-width-mobile: 28rem;
    }

    .leaf-layer-06 {
      right: -96vw;
      top: 12vh;
      --leaf-width-mobile: 30rem;
    }

    .leaf-layer-07 {
      left: -60vw;
      bottom: -22vh;
      --leaf-width-mobile: 30rem;
    }

    .leaf-layer-08 {
      left: 3vw;
      bottom: -29vh;
      --leaf-width-mobile: 31rem;
    }

    .leaf-layer-09 {
      right: -62vw;
      bottom: -23vh;
      --leaf-width-mobile: 30rem;
    }

    .leaf-layer-10 {
      left: -65vw;
      top: 35vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-11 {
      right: -70vw;
      top: 35vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-12 {
      left: 38vw;
      top: 22vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-13 {
      left: -18vw;
      top: 51vh;
      --leaf-width-mobile: 23rem;
    }

    .leaf-layer-14 {
      right: -18vw;
      top: 51vh;
      --leaf-width-mobile: 23rem;
    }

    .leaf-layer-15 {
      left: 18vw;
      bottom: -13vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-16 {
      right: 16vw;
      bottom: -13vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-17 {
      left: 24vw;
      top: -19vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-18 {
      left: 68vw;
      top: 7vh;
      --leaf-width-mobile: 21rem;
    }

    .leaf-layer-19 {
      left: -34vw;
      top: 19vh;
      --leaf-width-mobile: 21rem;
    }

    .leaf-layer-20 {
      left: -75vw;
      top: 58vh;
      --leaf-width-mobile: 23rem;
    }

    .leaf-layer-21 {
      right: -75vw;
      top: 58vh;
      --leaf-width-mobile: 23rem;
    }

    .leaf-layer-22 {
      left: 52vw;
      top: 30vh;
      --leaf-width-mobile: 20rem;
    }

    .leaf-layer-23 {
      left: -26vw;
      top: -25vh;
      --leaf-width-mobile: 21rem;
    }

    .leaf-layer-24 {
      right: -26vw;
      top: -25vh;
      --leaf-width-mobile: 21rem;
    }

    .leaf-layer-25 {
      left: 31vw;
      bottom: -40vh;
      --leaf-width-mobile: 25rem;
    }

    .leaf-layer-26 {
      left: -82vw;
      top: 46vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-27 {
      right: -82vw;
      top: 46vh;
      --leaf-width-mobile: 22rem;
    }

    .leaf-layer-28 {
      left: 20vw;
      top: 43vh;
      --leaf-width-mobile: 24rem;
    }

    .leaf-layer-29 {
      left: 3vw;
      top: 18vh;
      --leaf-width-mobile: 18rem;
    }

    .leaf-layer-30 {
      right: 1vw;
      top: 18vh;
      --leaf-width-mobile: 18rem;
    }

    .leaf-layer-31 {
      left: 12vw;
      top: 47vh;
      --leaf-width-mobile: 19rem;
    }

    .leaf-layer-32 {
      right: 11vw;
      top: 49vh;
      --leaf-width-mobile: 19rem;
    }

    .leaf-layer-33 {
      left: -34vw;
      top: 5vh;
      --leaf-width-mobile: 17rem;
    }

    .leaf-layer-34 {
      right: -34vw;
      top: 5vh;
      --leaf-width-mobile: 17rem;
    }

    .leaf-layer-35 {
      left: -28vw;
      bottom: 2vh;
      --leaf-width-mobile: 18rem;
    }

    .leaf-layer-36 {
      right: -28vw;
      bottom: 2vh;
      --leaf-width-mobile: 18rem;
    }

    .leaf-layer-37 {
      left: 30vw;
      top: -3vh;
      --leaf-width-mobile: 16rem;
    }

    .leaf-layer-38 {
      left: 31vw;
      bottom: -5vh;
      --leaf-width-mobile: 16rem;
    }

    .leaf-layer-39 {
      left: -42vw;
      top: 32vh;
      --leaf-width-mobile: 17rem;
    }

    .leaf-layer-40 {
      right: -42vw;
      top: 32vh;
      --leaf-width-mobile: 17rem;
    }

    .landing-scroll-meter {
      right: 1rem;
      left: 1rem;
      bottom: 1rem;
      justify-content: space-between;
    }

    .meter-track {
      flex: 1;
      width: auto;
    }
  }

  @media (max-width: 430px) {
    .landing-sticky-stage {
      place-items: center start;
    }

    .landing-brand-lockup h1 {
      font-size: clamp(3.45rem, 20vw, 4.9rem);
    }

    .landing-title-by {
      font-size: 0.68rem;
      transform: translateY(-0.25em);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing-page {
      min-height: 100vh;
    }

    .landing-sticky-stage {
      position: relative;
    }

    .leaf-field {
      transform: none;
      opacity: 0.22;
    }

    .landing-brand-lockup {
      opacity: 1;
      transform: none;
    }
  }
</style>
