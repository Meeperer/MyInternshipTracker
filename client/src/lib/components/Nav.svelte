<script>
  import { auth } from '$stores/auth.js';
  import { page } from '$app/stores';

  function handleLogout() {
    auth.logout();
    window.location.href = '/login';
  }

  const estOptions = { timeZone: 'America/New_York' };

  function clockTime() {
    return new Date().toLocaleTimeString('en-US', {
      ...estOptions,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function clockDate() {
    return new Date().toLocaleDateString('en-US', {
      ...estOptions,
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }

  let time = $state(clockTime());
  let dateLabel = $state(clockDate());

  $effect(() => {
    const interval = setInterval(() => {
      time = clockTime();
      dateLabel = clockDate();
    }, 1000);
    return () => clearInterval(interval);
  });

  const views = [
    { id: 'dashboard', label: 'DASHBOARD', href: '/dashboard' },
    { id: 'calendar', label: 'CALENDAR', href: '/calendar' },
    { id: 'pomodoro', label: 'POMODORO', href: '/pomodoro' },
    { id: 'journal', label: 'JOURNAL', href: '/journal' }
  ];

  const activePath = $derived($page.url.pathname);
</script>

<nav class="top-nav">
  <div class="nav-left">
    <span class="clock">{time}</span>
    <span class="clock-label">{dateLabel}</span>
  </div>

  <div class="nav-center">
    {#each views as view}
      <a
        href={view.href}
        class="nav-link"
        class:active={activePath === view.href}
        aria-current={activePath === view.href ? 'page' : undefined}
      >
        {view.label}
      </a>
    {/each}
  </div>

  <div class="nav-right">
    <button class="btn btn-sm btn-ghost" onclick={handleLogout}>
      Logout
    </button>
  </div>
</nav>

<style>
  .top-nav {
    position: relative;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.75rem 3rem;
    border-bottom: 2px solid var(--border-light);
    flex-shrink: 0;
    background: var(--bg);
  }

  .nav-left {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    min-width: 180px;
  }

  .clock {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--red);
    letter-spacing: 0.06em;
  }

  .clock-label {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--dark-soft);
  }

  .nav-center {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 2rem;
    justify-content: center;
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    padding: 0.6rem 1.35rem;
    border: none;
    background: transparent;
    font-family: var(--font-ui);
    font-size: 1.1rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--dark-soft);
    border-radius: var(--radius);
    transition: color 0.2s ease, background 0.2s ease, transform 0.18s var(--ease-out);
    text-decoration: none;
    cursor: pointer;
  }
  .nav-link:hover {
    color: var(--red);
    background: rgba(190, 53, 25, 0.08);
    transform: translateY(-1px);
  }
  .nav-link.active {
    color: var(--red);
    background: rgba(190, 53, 25, 0.1);
    font-weight: 700;
  }
  .nav-link.active:hover {
    background: rgba(190, 53, 25, 0.14);
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    min-width: 180px;
    justify-content: flex-end;
  }

  .nav-right .btn {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  @media (max-width: 992px) {
    .top-nav {
      padding: 1.5rem 2rem;
    }
    .clock {
      font-size: 1.65rem;
    }
    .nav-link {
      font-size: 1rem;
      padding: 0.5rem 1.1rem;
    }
    .nav-left,
    .nav-right {
      min-width: 140px;
    }
  }

  @media (max-width: 768px) {
    .top-nav {
      flex-wrap: wrap;
      padding: 1.25rem 1.5rem;
      gap: 0.75rem;
    }
    .clock {
      font-size: 1.5rem;
    }
    .clock-label {
      font-size: 0.7rem;
      letter-spacing: 0.15em;
    }
    .nav-link {
      font-size: 0.9rem;
      padding: 0.45rem 0.9rem;
      letter-spacing: 0.08em;
    }
    .nav-center {
      gap: 0.5rem 1.25rem;
    }
    .nav-left { order: 1; min-width: auto; }
    .nav-right { order: 2; min-width: auto; }
    .nav-right .btn {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }
  }

  @media (max-width: 480px) {
    .top-nav {
      padding: 1rem 1rem;
      gap: 0.5rem;
    }
    .clock {
      font-size: 1.25rem;
    }
    .clock-label {
      font-size: 0.6rem;
    }
    .nav-link {
      font-size: 0.8rem;
      padding: 0.4rem 0.7rem;
    }
    .nav-center {
      gap: 0.4rem 1rem;
    }
  }
</style>
