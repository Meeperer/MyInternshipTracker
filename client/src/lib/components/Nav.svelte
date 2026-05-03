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
    Notebook,
    SignOut,
    SquaresFour,
    Timer
  } from 'phosphor-svelte';

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
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', href: '/dashboard', icon: SquaresFour },
    { id: 'calendar', label: 'Calendar', shortLabel: 'Calendar', href: '/calendar', icon: CalendarBlank },
    { id: 'pomodoro', label: 'Pomodoro', shortLabel: 'Focus', href: '/pomodoro', icon: Timer },
    { id: 'journal', label: 'Journal', shortLabel: 'Journal', href: '/journal', icon: Notebook }
  ];

  const activePath = $derived($page.url.pathname);
</script>

<nav class="top-nav animate-rise rise-1">
  <div class="nav-meta">
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

  <div class="nav-center" role="navigation" aria-label="Primary">
    {#each views as view}
      <a
        href={view.href}
        class="nav-link"
        class:active={activePath === view.href}
        aria-current={activePath === view.href ? 'page' : undefined}
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
      <span class="command-trigger-label">Quick actions</span>
      <span class="command-trigger-shortcut">Ctrl/Cmd K</span>
    </button>

    <button class="logout-trigger" onclick={handleLogout} aria-label="Log out">
      <SignOut size={16} weight="bold" />
      <span>Logout</span>
    </button>
  </div>
</nav>

<style>
  .top-nav {
    position: relative;
    z-index: 100;
    display: grid;
    grid-template-columns: minmax(0, 300px) minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem 1.25rem;
    padding: 1.15rem 1.4rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.12);
    background: rgba(251, 250, 233, 0.92);
    backdrop-filter: blur(10px);
    flex-shrink: 0;
  }

  .nav-meta {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .meta-clock {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;
  }

  .meta-icon,
  .timezone-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--red);
  }

  .meta-copy {
    display: grid;
    min-width: 0;
  }

  .clock {
    font-family: var(--font-display);
    font-size: clamp(1.45rem, 2vw, 1.95rem);
    font-weight: 700;
    line-height: 1;
    color: var(--red);
    letter-spacing: 0.02em;
  }

  .clock-label {
    margin-top: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--dark-muted);
  }

  .timezone-control {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    width: min(100%, 320px);
    min-width: 0;
  }

  .timezone-select {
    width: 100%;
    min-height: 2.5rem;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(190, 53, 25, 0.14);
    background: rgba(255, 255, 255, 0.72);
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.74rem;
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
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(190, 53, 25, 0.28);
    box-shadow: 0 0 0 1px rgba(190, 53, 25, 0.08);
  }

  .nav-center {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.85rem;
    padding: 0.62rem 0.95rem;
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dark-soft);
    background: transparent;
    border: 1px solid transparent;
    transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--red);
    background: rgba(190, 53, 25, 0.06);
    border-color: rgba(190, 53, 25, 0.12);
    transform: translateY(-1px);
  }

  .nav-link.active {
    color: var(--red);
    background: rgba(190, 53, 25, 0.1);
    border-color: rgba(190, 53, 25, 0.18);
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
    justify-content: flex-end;
    gap: 0.7rem;
    min-width: 0;
  }

  .command-trigger,
  .logout-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 2.7rem;
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(190, 53, 25, 0.14);
    background: rgba(255, 255, 255, 0.8);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--dark-soft);
    transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .command-trigger:hover,
  .logout-trigger:hover {
    transform: translateY(-1px);
    border-color: rgba(190, 53, 25, 0.24);
    background: white;
    color: var(--red);
    box-shadow: 0 10px 20px rgba(34, 24, 8, 0.06);
  }

  .command-trigger-shortcut {
    padding: 0.2rem 0.42rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    color: var(--red);
    font-size: 0.67rem;
    letter-spacing: 0.03em;
  }

  @media (max-width: 1120px) {
    .top-nav {
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 1rem 1.2rem;
    }

    .nav-center {
      grid-column: 1 / -1;
      order: 3;
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 0.15rem;
      scrollbar-width: none;
    }

    .nav-center::-webkit-scrollbar {
      display: none;
    }

    .command-trigger-label {
      display: none;
    }
  }

  @media (max-width: 720px) {
    .top-nav {
      grid-template-columns: 1fr;
      gap: 0.85rem;
      padding: 0.95rem 1rem;
    }

    .nav-actions {
      justify-content: space-between;
    }

    .command-trigger-shortcut {
      display: none;
    }

    .logout-trigger span {
      display: none;
    }
  }

  @media (max-width: 520px) {
    .nav-link-label {
      display: none;
    }

    .nav-link-short {
      display: inline;
    }

    .nav-link {
      padding-inline: 0.85rem;
    }

    .timezone-control {
      width: 100%;
    }
  }
</style>
