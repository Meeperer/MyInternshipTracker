<script>
  import { auth } from '$stores/auth.js';
  import { appCommands } from '$stores/appCommands.js';
  import { page } from '$app/stores';
  import { timezone, timezoneOptions } from '$stores/timezone.js';
  import {
    CalendarBlank,
    ClockCountdown,
    Command,
    GlobeHemisphereWest,
    List,
    Notebook,
    SignOut,
    SquaresFour,
    Timer,
    X
  } from 'phosphor-svelte';

  let mobileNavOpen = $state(false);

  function handleLogout() {
    auth.logout();
    window.location.href = '/login';
  }

  function clockTime(tz) {
    return new Date().toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function clockDate(tz) {
    return new Date().toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }

  let time = $state(clockTime($timezone));
  let dateLabel = $state(clockDate($timezone));

  $effect(() => {
    const tz = $timezone;
    const interval = setInterval(() => {
      time = clockTime(tz);
      dateLabel = clockDate(tz);
    }, 1000);
    return () => clearInterval(interval);
  });

  const views = [
    { id: 'dashboard', label: 'Home', shortLabel: 'Home', href: '/dashboard', icon: SquaresFour },
    { id: 'calendar', label: 'Calendar', shortLabel: 'Cal', href: '/calendar', icon: CalendarBlank },
    { id: 'pomodoro', label: 'Focus', shortLabel: 'Focus', href: '/pomodoro', icon: Timer },
    { id: 'journal', label: 'Journal', shortLabel: 'Log', href: '/journal', icon: Notebook }
  ];

  const activePath = $derived($page.url.pathname);

  $effect(() => {
    activePath;
    mobileNavOpen = false;
  });
</script>

<nav class="top-nav animate-rise rise-1" class:mobile-open={mobileNavOpen} aria-label="App">
  <div class="nav-meta">
    <a class="nav-brand" href="/dashboard" aria-label="Journal dashboard">
      <span class="nav-brand-mark" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 21V5" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
          <path d="M12 9C8.8 5.8 5.8 5 3 6.2c1.3 3.4 4.2 5.1 9 2.8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />
          <path d="M12 14c4.1-4.1 7.4-4.7 10-3.1-1.8 3.7-5.1 5-10 3.1Z" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />
        </svg>
      </span>
      <span class="nav-brand-copy">
        <strong>JOURNAL</strong>
        <small>by lord</small>
      </span>
    </a>

    <div class="meta-clock">
      <span class="meta-icon" aria-hidden="true">
        <ClockCountdown size={18} weight="duotone" />
      </span>
      <div class="meta-copy">
        <span class="clock">{time}</span>
        <span class="clock-label">{dateLabel}</span>
      </div>
    </div>

    <label class="timezone-control">
      <span class="timezone-icon" aria-hidden="true">
        <GlobeHemisphereWest size={16} weight="regular" />
      </span>
      <span class="sr-only">Time zone</span>
      <select
        class="timezone-select"
        bind:value={$timezone}
        aria-label="Select time zone"
      >
        {#each timezoneOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <button
    class="mobile-menu-trigger"
    type="button"
    aria-controls="primary-nav-menu"
    aria-expanded={mobileNavOpen}
    aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
    onclick={() => (mobileNavOpen = !mobileNavOpen)}
  >
    {#if mobileNavOpen}
      <X size={18} weight="bold" />
    {:else}
      <List size={18} weight="bold" />
    {/if}
    <span>Menu</span>
  </button>

  <div id="primary-nav-menu" class="nav-center" aria-label="Primary">
    {#each views as view}
      <a
        href={view.href}
        class="nav-link"
        class:active={activePath === view.href}
        aria-current={activePath === view.href ? 'page' : undefined}
        onclick={() => (mobileNavOpen = false)}
      >
        <span class="nav-link-icon" aria-hidden="true">
          <view.icon size={18} weight={activePath === view.href ? 'fill' : 'regular'} />
        </span>
        <span class="nav-link-label">{view.label}</span>
        <span class="nav-link-short">{view.shortLabel}</span>
      </a>
    {/each}
  </div>

  <div class="nav-actions">
    <button
      class="command-trigger"
      type="button"
      onclick={() => appCommands.openPalette()}
      aria-label="Open command palette"
    >
      <Command size={16} weight="bold" />
      <span class="command-trigger-label">Command</span>
      <span class="command-trigger-shortcut">K</span>
    </button>

    <button class="logout-trigger" onclick={handleLogout} aria-label="Log out">
      <SignOut size={16} weight="bold" />
      <span>Exit</span>
    </button>
  </div>

  <img
    class="botanical-cutout nav-organic-mark"
    src="/plants/palm-fan.png"
    alt=""
    aria-hidden="true"
    loading="lazy"
    decoding="async"
    data-tone="cream"
  />
</nav>

<style>
  .top-nav {
    position: sticky;
    top: 0;
    z-index: 100;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    align-items: start;
    align-self: start;
    gap: 1rem;
    height: 100dvh;
    min-height: 100dvh;
    max-height: 100dvh;
    padding: 1rem;
    border-right: 2px solid rgba(36, 24, 15, 0.92);
    background:
      linear-gradient(rgba(246, 239, 210, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(246, 239, 210, 0.035) 1px, transparent 1px),
      var(--canopy);
    background-size: 28px 28px, 28px 28px, auto;
    color: var(--cream);
    overflow: hidden;
  }

  .nav-meta,
  .nav-center,
  .nav-actions {
    position: relative;
    z-index: 1;
  }

  .nav-meta {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .nav-brand {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.7rem;
    color: var(--cream);
  }

  .nav-brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 2px solid var(--cream);
    border-radius: 7px;
    background: var(--leaf);
    color: var(--cream);
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.22);
  }

  .nav-brand-copy {
    display: grid;
    line-height: 1;
  }

  .nav-brand-copy strong {
    color: var(--cream);
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 400;
    letter-spacing: 0;
  }

  .nav-brand-copy small {
    margin-top: 0.2rem;
    color: rgba(248, 239, 212, 0.72);
    font-family: var(--font-ui);
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .nav-organic-mark {
    position: absolute;
    left: -5.75rem;
    bottom: -7.35rem;
    z-index: 0;
    width: 21rem;
    max-height: none;
    object-fit: contain;
    object-position: center;
    opacity: 0.13;
    transform: rotate(-9deg);
  }

  .meta-clock {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.6rem;
    min-width: 0;
    padding: 0.8rem 0;
    border-top: 1px solid rgba(248, 239, 212, 0.2);
    border-bottom: 1px solid rgba(248, 239, 212, 0.2);
  }

  .meta-icon,
  .timezone-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--lichen);
  }

  .meta-copy {
    display: grid;
    min-width: 0;
  }

  .clock {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1;
    color: var(--cream);
    letter-spacing: 0.02em;
  }

  .clock-label {
    margin-top: 0.2rem;
    font-family: var(--font-ui);
    font-size: 0.64rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(248, 239, 212, 0.66);
  }

  .timezone-control {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    min-width: 0;
  }

  .timezone-select {
    width: 100%;
    min-height: 2.3rem;
    padding: 0.42rem 0.65rem;
    border-radius: 6px;
    border: 1px solid rgba(248, 239, 212, 0.24);
    background: rgba(3, 28, 15, 0.42);
    color: var(--cream);
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    outline: none;
    appearance: none;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }

  .timezone-select:hover,
  .timezone-select:focus-visible {
    background: rgba(3, 28, 15, 0.72);
    border-color: var(--lichen);
    box-shadow: 0 0 0 3px rgba(216, 227, 184, 0.16);
  }

  .nav-center {
    display: grid;
    gap: 0.35rem;
    align-content: start;
    min-width: 0;
  }

  .nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.6rem;
    min-height: 2.75rem;
    padding: 0.62rem 0.7rem;
    border-radius: 6px;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(248, 239, 212, 0.82);
    background: transparent;
    border: 2px solid transparent;
    transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--cream);
    background: rgba(216, 227, 184, 0.1);
    border-color: rgba(248, 239, 212, 0.2);
    transform: translateX(2px);
  }

  .nav-link.active {
    color: var(--cream);
    background: var(--leaf);
    border-color: var(--cream);
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.2);
  }

  .nav-link:active {
    transform: translateX(0) scale(0.985);
  }

  .nav-link-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .nav-link-short {
    display: none;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    align-self: end;
    justify-content: flex-end;
    gap: 0.55rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .mobile-menu-trigger {
    display: none;
  }

  .command-trigger,
  .logout-trigger,
  .mobile-menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(248, 239, 212, 0.26);
    background: rgba(3, 28, 15, 0.44);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--cream);
    transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .command-trigger:hover,
  .logout-trigger:hover,
  .mobile-menu-trigger:hover {
    transform: translate(-1px, -1px);
    border-color: var(--lichen);
    background: rgba(216, 227, 184, 0.12);
    color: var(--cream);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.16);
  }

  .command-trigger:active,
  .logout-trigger:active,
  .mobile-menu-trigger:active {
    transform: translate(0, 0) scale(0.985);
    box-shadow: none;
  }

  .command-trigger-shortcut {
    padding: 0.16rem 0.35rem;
    border-radius: 4px;
    background: var(--lichen);
    color: var(--canopy);
    font-size: 0.67rem;
    letter-spacing: 0.03em;
  }

  .mobile-menu-trigger {
    display: none;
  }

  @media (max-width: 980px) {
    .top-nav {
      position: sticky;
      height: auto;
      min-height: 0;
      max-height: none;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-right: 0;
      border-bottom: 2px solid rgba(36, 24, 15, 0.9);
      overflow: visible;
      animation: none;
      transform: none;
    }

    .nav-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .nav-organic-mark,
    .meta-clock,
    .timezone-control {
      display: none;
    }

    .mobile-menu-trigger {
      position: relative;
      z-index: 2;
      display: inline-flex;
      min-height: 2.55rem;
      padding-inline: 0.85rem;
      border-width: 2px;
      border-color: rgba(248, 239, 212, 0.42);
      background: rgba(3, 28, 15, 0.7);
      text-transform: uppercase;
    }

    .nav-center {
      position: fixed;
      left: 0.65rem;
      right: 0.65rem;
      bottom: calc(0.65rem + env(safe-area-inset-bottom, 0px));
      z-index: 120;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.25rem;
      padding: 0.35rem;
      border: 2px solid rgba(36, 24, 15, 0.92);
      border-radius: 10px;
      background:
        linear-gradient(rgba(248, 239, 212, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(248, 239, 212, 0.055) 1px, transparent 1px),
        rgba(2, 24, 13, 0.98);
      background-size: 18px 18px, 18px 18px, auto;
      box-shadow: 0 -10px 24px rgba(2, 24, 13, 0.12), 4px 4px 0 rgba(36, 24, 15, 0.16);
    }

    .nav-link {
      min-height: 3.25rem;
      width: 100%;
      justify-content: center;
      flex-direction: column;
      gap: 0.18rem;
      padding: 0.42rem 0.3rem;
      border-width: 1px;
      text-align: center;
      font-size: 0.62rem;
      letter-spacing: 0.06em;
    }

    .nav-link:hover {
      transform: none;
      box-shadow: none;
    }

    .nav-link.active {
      border-color: var(--lichen);
      box-shadow: inset 0 0 0 1px rgba(248, 239, 212, 0.18);
    }

    .nav-link-icon :global(svg) {
      width: 1.1rem;
      height: 1.1rem;
    }

    .nav-actions {
      display: none;
      position: fixed;
      top: 4.65rem;
      left: 0.75rem;
      right: 0.75rem;
      z-index: 130;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      justify-content: stretch;
      padding: 0.65rem;
      border: 2px solid rgba(248, 239, 212, 0.28);
      border-radius: 10px;
      background: rgba(2, 24, 13, 0.96);
      box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.18);
    }

    .top-nav.mobile-open .nav-center {
      display: grid;
    }

    .top-nav.mobile-open .nav-actions {
      display: grid;
      animation: menu-in 0.16s var(--ease-out);
    }

    .top-nav.mobile-open .nav-center + .nav-actions {
      margin-top: 0;
    }

    .command-trigger,
    .logout-trigger {
      flex: 1 1 0;
      min-height: 2.65rem;
    }

    .command-trigger-label,
    .command-trigger-shortcut {
      display: inline;
    }

    .command-trigger-shortcut {
      display: inline-flex;
    }
  }

  @media (max-width: 520px) {
    .nav-center {
      left: 0.45rem;
      right: 0.45rem;
      bottom: calc(0.45rem + env(safe-area-inset-bottom, 0px));
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.2rem;
      padding: 0.3rem;
    }

    .nav-link-label {
      display: none;
    }

    .nav-link-short {
      display: inline;
    }

    .nav-link {
      min-height: 3.05rem;
      gap: 0.14rem;
      padding-inline: 0.22rem;
      font-size: 0.58rem;
    }

    .nav-brand-copy strong {
      font-size: 1rem;
    }

    .nav-brand-mark {
      width: 2.25rem;
      height: 2.25rem;
    }

    .logout-trigger span {
      display: inline;
    }

    .nav-actions {
      top: 4.25rem;
      left: 0.5rem;
      right: 0.5rem;
    }
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-link:hover,
    .nav-link:active,
    .command-trigger:hover,
    .command-trigger:active,
    .logout-trigger:hover,
    .logout-trigger:active {
      transform: none;
    }
  }
</style>
