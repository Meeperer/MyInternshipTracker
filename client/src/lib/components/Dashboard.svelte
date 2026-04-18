<script>
  import { onMount } from 'svelte';
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import { events } from '$stores/events.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { toast } from '$stores/toast.js';
  import { monthValueFromDate, parseMonthValue, todayString } from '$utils/date.js';
  import { api } from '$utils/api.js';

  let { onNavigateToDate = () => {} } = $props();

  const HOURS_MILESTONES = [100, 250, 400, 486];
  const STREAK_MILESTONES = [3, 7, 14];

  let dashboardNode;
  let compilationStatus = $state(null);
  let compiling = $state(false);
  let downloading = $state(false);
  let todayEvents = $state([]);
  let eventsLoading = $state(true);
  let celebration = $state(null);
  let parallaxShift = $state(0);
  let parallaxProgress = $state(0);

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long'
  });

  const QUOTES = [
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: "It always seems impossible until it's done.", author: 'Nelson Mandela' },
    { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Robin Sharma' },
    { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
    { text: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson' },
    { text: 'Consistency is the hallmark of the unimaginative.', author: 'Oscar Wilde' },
    { text: 'You are never too old to set another goal or to dream a new dream.', author: 'C.S. Lewis' },
    { text: 'Energy and persistence conquer all things.', author: 'Benjamin Franklin' },
    { text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
    { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' }
  ];

  function formatMonthLabel(monthValue) {
    const { year, month } = parseMonthValue(monthValue);
    return MONTH_LABEL_FORMATTER.format(new Date(year, (month || 1) - 1, 1));
  }

  function formatTimeRange(ev) {
    const start = ev.start_time?.slice(0, 5);
    const end = ev.end_time?.slice(0, 5);
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    if (end) return `until ${end}`;
    return '';
  }

  function formatHours(value) {
    if (!value) return '0h';
    return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
  }

  function formatMilestoneCopy(milestone) {
    if (milestone.reached) {
      return milestone.hours >= 486
        ? 'Target cleared. The dashboard can turn toward reporting and review.'
        : 'This marker is already part of the record now.';
    }

    if (milestone.remaining <= 16) return 'Very close now. One more solid push will move it.';
    if (milestone.remaining <= 48) return 'Within reach. The progress line already leans toward it.';
    return 'Still ahead, but now visible enough to plan around.';
  }

  function getCelebrationStorage() {
    if (typeof localStorage === 'undefined') return {};

    try {
      return JSON.parse(localStorage.getItem('progress-celebrations') || '{}');
    } catch {
      return {};
    }
  }

  function markCelebrationSeen(key) {
    if (typeof localStorage === 'undefined') return;
    const current = getCelebrationStorage();
    localStorage.setItem('progress-celebrations', JSON.stringify({
      ...current,
      [key]: true
    }));
  }

  function closeCelebration() {
    if (celebration?.key) {
      markCelebrationSeen(celebration.key);
    }
    celebration = null;
  }

  function shiftSelectedMonth(delta) {
    selectedMonth.shift(delta);
  }

  async function handleCompile() {
    compiling = true;
    try {
      await api.post('/compilation/compile', {});
      compilationStatus = await api.get('/compilation/status');
      toast.success('Report compiled successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      compiling = false;
    }
  }

  async function handleDownload() {
    downloading = true;
    try {
      const blob = await api.getBlob('/compilation/download');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Internship_Journal_Report.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      downloading = false;
    }
  }

  // Respect reduced-motion users by disabling the scroll-linked dashboard layers entirely.
  function initParallax() {
    if (typeof window === 'undefined' || !dashboardNode) return () => {};

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scrollHost = dashboardNode.closest('main#main-content');
    if (!scrollHost) return () => {};

    let frame = 0;

    const updateParallax = () => {
      frame = 0;

      if (motionQuery.matches) {
        parallaxShift = 0;
        parallaxProgress = 0;
        return;
      }

      const scrollTop = scrollHost.scrollTop;
      const maxScroll = Math.max(scrollHost.scrollHeight - scrollHost.clientHeight, 1);

      parallaxShift = Math.min(scrollTop, 560);
      parallaxProgress = Math.min(scrollTop / maxScroll, 1);
    };

    const queueUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateParallax);
    };

    const handleMotionChange = () => updateParallax();

    updateParallax();
    scrollHost.addEventListener('scroll', queueUpdate, { passive: true });

    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', handleMotionChange);
    } else {
      motionQuery.addListener(handleMotionChange);
    }

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      scrollHost.removeEventListener('scroll', queueUpdate);
      if (typeof motionQuery.removeEventListener === 'function') {
        motionQuery.removeEventListener('change', handleMotionChange);
      } else {
        motionQuery.removeListener(handleMotionChange);
      }
    };
  }

  let targetHours = $derived($progress.target_hours || 486);
  let dashboardMonthLabel = $derived.by(() => formatMonthLabel($selectedMonth || monthValueFromDate()));
  let dashboardBusy = $derived($progress.loading || $journal.loading);
  let todayQuote = $derived.by(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return QUOTES[dayOfYear % QUOTES.length];
  });

  let monthStats = $derived.by(() => {
    const entries = $journal.entries || [];
    const count = entries.length;
    const finished = entries.filter((entry) => entry.status === 'finished').length;
    const hours = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    return { count, finished, hours: Math.round(hours * 10) / 10 };
  });

  let monthInsights = $derived.by(() => {
    const entries = $journal.entries || [];
    const activeEntries = entries.filter((entry) =>
      (Number(entry.hours) || 0) > 0 || (entry.content_raw || '').trim().length > 0
    );
    const totalHours = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const activeDays = activeEntries.length;
    const finishedDays = entries.filter((entry) => entry.status === 'finished').length;
    const averagePerActiveDay = activeDays > 0 ? totalHours / activeDays : 0;
    const remaining = $progress.remaining_hours;
    const avgDaily = $progress.days_completed > 0 ? $progress.total_hours / $progress.days_completed : 8;

    const workingDaysNeeded = avgDaily > 0 ? Math.ceil(remaining / avgDaily) : 0;
    let projectedDate = 'Complete';

    if (workingDaysNeeded > 0) {
      const date = new Date();
      let remainingWorkDays = workingDaysNeeded;

      while (remainingWorkDays > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) {
          remainingWorkDays -= 1;
        }
      }

      projectedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      activeDays,
      finishedDays,
      averagePerActiveDay: Math.round(averagePerActiveDay * 10) / 10,
      projectedCompletion: projectedDate,
      daysNeeded: workingDaysNeeded
    };
  });

  let monthContribution = $derived.by(() =>
    targetHours > 0 ? Math.min(100, Math.round((monthInsights.totalHours / targetHours) * 100)) : 0
  );

  let completionRate = $derived.by(() =>
    monthStats.count > 0 ? Math.round((monthStats.finished / monthStats.count) * 100) : 0
  );

  let cadenceLabel = $derived.by(() => {
    const avg = monthInsights.averagePerActiveDay;
    if (avg >= 8) return 'Full-day pace';
    if (avg >= 5) return 'Steady pace';
    if (avg >= 2.5) return 'Building pace';
    if (avg > 0) return 'Light pace';
    return 'No pace yet';
  });

  let greetingLabel = $derived.by(() => {
    const pct = $progress.percentage;
    if (pct >= 100) return 'Requirement complete';
    if (pct >= 75) return 'Closing stretch';
    if (pct >= 50) return 'Halfway through';
    if (pct >= 25) return 'Solid start';
    return 'Early run';
  });

  let milestoneCards = $derived.by(() =>
    HOURS_MILESTONES.map((hours) => ({
      hours,
      reached: $progress.total_hours >= hours,
      remaining: Math.max(0, hours - $progress.total_hours)
    }))
  );

  let nextMilestone = $derived.by(() => milestoneCards.find((milestone) => !milestone.reached) || null);

  let progressMarkers = $derived.by(() =>
    HOURS_MILESTONES.map((hours) => ({
      hours,
      reached: $progress.total_hours >= hours,
      left: Math.min((hours / targetHours) * 100, 100)
    }))
  );

  let todaySummary = $derived.by(() => {
    if (eventsLoading) return 'Loading today';
    if (todayEvents.length === 0) return 'No events scheduled today';
    return `${todayEvents.length} event${todayEvents.length === 1 ? '' : 's'} scheduled today`;
  });

  let monthSummaryLine = $derived.by(() => {
    if (monthStats.count === 0) {
      return `No entries are logged in ${dashboardMonthLabel} yet.`;
    }

    return `${dashboardMonthLabel} holds ${formatHours(monthStats.hours)} across ${monthStats.count} entries, with ${monthStats.finished} finished days already counting toward the requirement.`;
  });

  let nextActionLine = $derived.by(() => {
    if ($progress.is_completed) {
      return 'The hours requirement is complete, so the dashboard can shift from chasing totals to reviewing the finished record.';
    }

    if (nextMilestone) {
      return `${nextMilestone.remaining} hours remain before the ${nextMilestone.hours}-hour milestone is cleared.`;
    }

    return 'Every planned milestone is already complete.';
  });

  $effect(() => {
    if (!$selectedMonth) {
      selectedMonth.init();
      return;
    }

    const { year, month } = parseMonthValue($selectedMonth);
    journal.fetchMonth(year, month);
  });

  $effect(() => {
    if ($progress.loading || typeof localStorage === 'undefined' || celebration) return;

    const seen = getCelebrationStorage();
    const newestHoursMilestone = [...HOURS_MILESTONES]
      .reverse()
      .find((hours) => $progress.total_hours >= hours && !seen[`hours-${hours}`]);

    if (newestHoursMilestone) {
      celebration = {
        key: `hours-${newestHoursMilestone}`,
        title: newestHoursMilestone >= 486 ? '486 hours complete' : `${newestHoursMilestone} hours reached`,
        message: newestHoursMilestone >= 486
          ? 'You hit the full internship target. This is the handoff point from accumulation to finishing work.'
          : `Your log just crossed ${newestHoursMilestone} hours. The tracker reads like real momentum now.`
      };
      return;
    }

    const newestStreakMilestone = [...STREAK_MILESTONES]
      .reverse()
      .find((days) => $progress.current_streak >= days && !seen[`streak-${days}`]);

    if (newestStreakMilestone) {
      celebration = {
        key: `streak-${newestStreakMilestone}`,
        title: `${newestStreakMilestone}-day streak`,
        message: `You have stayed consistent for ${newestStreakMilestone} days in a row. That rhythm is now visible in the overall record.`
      };
    }
  });

  onMount(() => {
    api.get('/compilation/status').then((status) => (compilationStatus = status)).catch(() => {});
    events.fetchDate(todayString())
      .then((list) => (todayEvents = list || []))
      .finally(() => {
        eventsLoading = false;
      });

    const cleanupParallax = initParallax();
    return () => cleanupParallax();
  });
</script>

<div
  class="dashboard"
  bind:this={dashboardNode}
  style={`--parallax-shift: ${parallaxShift}px; --parallax-progress: ${parallaxProgress};`}
  aria-busy={dashboardBusy || eventsLoading}
>
  <!-- Decorative parallax layers stay hidden from assistive tech so the reading order remains clean. -->
  <div class="dashboard-parallax" aria-hidden="true">
    <span class="parallax-sheet parallax-sheet-a"></span>
    <span class="parallax-sheet parallax-sheet-b"></span>
    <span class="parallax-sheet parallax-sheet-c"></span>
    <span class="parallax-orbit parallax-orbit-a"></span>
    <span class="parallax-orbit parallax-orbit-b"></span>
    <span class="parallax-rule parallax-rule-a"></span>
    <span class="parallax-rule parallax-rule-b"></span>
    <span class="parallax-rule parallax-rule-c"></span>
  </div>

  <header class="dashboard-bar animate-rise rise-1">
    <div class="dashboard-bar-copy">
      <h1>Dashboard</h1>
      <p>{dashboardMonthLabel}. {$progress.total_hours} of {targetHours} hours logged, {$progress.remaining_hours} remaining.</p>
    </div>

    <div class="dashboard-bar-controls" role="group" aria-label="Selected month controls">
      <button type="button" class="btn btn-sm" onclick={() => shiftSelectedMonth(-1)}>
        Prev
      </button>

      <label class="month-picker">
        <span class="month-picker-label">Month</span>
        <input
          class="month-input"
          type="month"
          bind:value={$selectedMonth}
          aria-label="Select dashboard month"
        />
      </label>

      <button type="button" class="btn btn-sm" onclick={() => shiftSelectedMonth(1)}>
        Next
      </button>
    </div>
  </header>

  <section class="overview-panel card animate-rise rise-2" aria-labelledby="dashboard-overview-title">
    <div class="overview-copy">
      <h2 id="dashboard-overview-title">{greetingLabel}</h2>
      <p>{monthSummaryLine}</p>
      <p class="overview-secondary">{nextActionLine}</p>
    </div>

    <dl class="overview-metrics">
      <div class="overview-metric">
        <dt>Total logged</dt>
        <dd>{$progress.total_hours}</dd>
      </div>
      <div class="overview-metric">
        <dt>Remaining</dt>
        <dd>{$progress.remaining_hours}</dd>
      </div>
      <div class="overview-metric">
        <dt>This month</dt>
        <dd>{formatHours(monthStats.hours)}</dd>
      </div>
      <div class="overview-metric">
        <dt>Current streak</dt>
        <dd>{$progress.current_streak}d</dd>
      </div>
    </dl>
  </section>

  <section class="dashboard-main-grid animate-rise rise-3" aria-label="Progress overview">
    <div class="parallax-plane depth-1">
      <article class="trajectory-panel card">
        <header class="panel-head">
          <div>
            <h2>Trajectory</h2>
            <p>
              {#if nextMilestone}
                {nextMilestone.remaining} hours until the {nextMilestone.hours}-hour mark.
              {:else}
                Every major milestone is already cleared.
              {/if}
            </p>
          </div>

          {#if dashboardBusy}
            <div class="trajectory-total-skeleton" aria-hidden="true">
              <span class="skeleton-line short"></span>
              <span class="skeleton-line medium"></span>
            </div>
          {:else}
            <div class="trajectory-total">
              <span class="trajectory-total-value">{$progress.total_hours}</span>
              <span class="trajectory-total-unit">hours logged</span>
            </div>
          {/if}
        </header>

        {#if dashboardBusy}
          <div class="trajectory-skeleton" aria-hidden="true">
            <div class="skeleton-block trajectory-skeleton-rail"></div>
            <div class="trajectory-ledger trajectory-ledger-loading">
              {#each Array.from({ length: 4 }) as _}
                <div>
                  <span class="skeleton-line short"></span>
                  <span class="skeleton-line medium"></span>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="trajectory-rail" aria-label={`Progress toward ${targetHours} internship hours`}>
            <div class="trajectory-rail-track">
              <span class="trajectory-rail-fill" style={`width: ${Math.min($progress.percentage, 100)}%`}></span>

              {#each progressMarkers as marker}
                <span
                  class:reached={marker.reached}
                  class="trajectory-marker"
                  style={`left: ${marker.left}%`}
                  aria-hidden="true"
                >
                  <span class="trajectory-marker-line"></span>
                  <span class="trajectory-marker-label">{marker.hours}</span>
                </span>
              {/each}
            </div>
          </div>

          <dl class="trajectory-ledger">
            <div>
              <dt>Current status</dt>
              <dd>{greetingLabel}</dd>
            </div>
            <div>
              <dt>Projected finish</dt>
              <dd>{monthInsights.projectedCompletion}</dd>
            </div>
            <div>
              <dt>Average active day</dt>
              <dd>{formatHours(monthInsights.averagePerActiveDay)}</dd>
            </div>
            <div>
              <dt>Current streak</dt>
              <dd>{$progress.current_streak} days</dd>
            </div>
          </dl>
        {/if}
      </article>
    </div>

    <div class="parallax-plane depth-2">
      <aside class="month-panel card" aria-labelledby="month-panel-title">
        <header class="panel-head panel-head-compact">
          <div>
            <h2 id="month-panel-title">{dashboardMonthLabel}</h2>
            <p>{monthStats.count} entries currently in view.</p>
          </div>
        </header>

        {#if dashboardBusy}
          <div class="month-panel-grid month-panel-grid-loading" aria-hidden="true">
            {#each Array.from({ length: 4 }) as _}
              <div class="month-panel-tile month-panel-tile-loading">
                <span class="skeleton-line medium"></span>
                <span class="skeleton-line short"></span>
              </div>
            {/each}
          </div>
        {:else}
          <dl class="month-panel-grid">
            <div class="month-panel-tile">
              <dt>Hours this month</dt>
              <dd>{formatHours(monthStats.hours)}</dd>
            </div>
            <div class="month-panel-tile">
              <dt>Finished days</dt>
              <dd>{monthStats.finished}</dd>
            </div>
            <div class="month-panel-tile">
              <dt>Active days</dt>
              <dd>{monthInsights.activeDays}</dd>
            </div>
            <div class="month-panel-tile">
              <dt>Month share of goal</dt>
              <dd>{monthContribution}%</dd>
            </div>
          </dl>
        {/if}

        <p class="month-panel-note">
          {#if monthStats.finished > 0}
            {completionRate}% of this month&apos;s entries are already finished and counting toward the target.
          {:else}
            Finish entries in this month to move the total forward.
          {/if}
        </p>
      </aside>
    </div>
  </section>

  <section class="milestones-panel card animate-rise rise-4" aria-labelledby="dashboard-milestones-title">
    <header class="section-head">
      <div>
        <h2 id="dashboard-milestones-title">Milestones</h2>
        <p>Hours markers and streak progress in one line of sight.</p>
      </div>
      <p class="section-meta">{$progress.current_streak}-day streak. {$progress.longest_streak}-day best.</p>
    </header>

    {#if !dashboardBusy}
      <div class="milestones-runway" aria-hidden="true">
        <span class="milestones-runway-track"></span>
        <span class="milestones-runway-fill" style={`width: ${Math.min($progress.percentage, 100)}%`}></span>

        {#each progressMarkers as marker}
          <span
            class:reached={marker.reached}
            class="milestones-runway-stop"
            style={`left: ${marker.left}%`}
          >
            <span class="milestones-runway-dot"></span>
            <span class="milestones-runway-label">{marker.hours}</span>
          </span>
        {/each}
      </div>
    {/if}

    <div class="milestones-grid">
      {#each milestoneCards as milestone}
        <article class:reached={milestone.reached} class="milestone-card">
          <h3>{milestone.hours} hours</h3>
          <p class="milestone-status">
            {milestone.reached ? 'Reached' : `${milestone.remaining} hours left`}
          </p>
          <p class="milestone-note">{formatMilestoneCopy(milestone)}</p>
        </article>
      {/each}
    </div>
  </section>

  <section class="dashboard-lower-grid animate-rise rise-5">
    <div class="parallax-plane depth-1">
      <article class="snapshot-panel card" aria-labelledby="dashboard-snapshot-title">
        <header class="section-head">
          <div>
            <h2 id="dashboard-snapshot-title">Month snapshot</h2>
            <p>Selected month contribution, cadence, and completion forecast.</p>
          </div>
        </header>

        {#if dashboardBusy}
          <div class="snapshot-grid snapshot-grid-loading" aria-hidden="true">
            {#each Array.from({ length: 4 }) as _}
              <div class="snapshot-item">
                <span class="skeleton-line medium"></span>
                <span class="skeleton-line short"></span>
              </div>
            {/each}
          </div>
          <div class="snapshot-progress snapshot-progress-loading" aria-hidden="true">
            <div class="skeleton-line medium"></div>
            <div class="skeleton-block snapshot-loading-track"></div>
            <div class="skeleton-line long"></div>
          </div>
        {:else}
          <div class="snapshot-grid">
            <div class="snapshot-item">
              <span class="snapshot-value">{formatHours(monthInsights.totalHours)}</span>
              <span class="snapshot-label">Hours logged</span>
            </div>
            <div class="snapshot-item">
              <span class="snapshot-value">{monthInsights.activeDays}</span>
              <span class="snapshot-label">Days active</span>
            </div>
            <div class="snapshot-item">
              <span class="snapshot-value">{monthInsights.finishedDays}</span>
              <span class="snapshot-label">Days finished</span>
            </div>
            <div class="snapshot-item">
              <span class="snapshot-value">{cadenceLabel}</span>
              <span class="snapshot-label">Current cadence</span>
            </div>
          </div>

          <div class="snapshot-progress">
            <div class="snapshot-progress-head">
              <span>This month contributes {monthContribution}% of the internship goal.</span>
              <span>{formatHours(monthInsights.totalHours)}</span>
            </div>
            <div class="snapshot-progress-track" aria-hidden="true">
              <span class="snapshot-progress-fill" style={`width: ${monthContribution}%`}></span>
            </div>
            <p class="snapshot-footnote">
              {#if !$progress.is_completed}
                At your current pace, the projected finish lands around {monthInsights.projectedCompletion}.
              {:else}
                The target is complete, so this month now reads as part of the final record.
              {/if}
            </p>
          </div>
        {/if}
      </article>
    </div>

    <div class="parallax-plane depth-2">
      <article class="today-panel card" aria-labelledby="dashboard-today-title">
        <header class="section-head">
          <div>
            <h2 id="dashboard-today-title">Today</h2>
            <p>{todaySummary}</p>
          </div>
        </header>

        <div class="today-quote">
          <blockquote>{todayQuote.text}</blockquote>
          <cite>{todayQuote.author}</cite>
        </div>

        {#if eventsLoading}
          <div class="today-events-skeleton" aria-hidden="true">
            <div class="skeleton-line long"></div>
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line long"></div>
          </div>
        {:else if todayEvents.length > 0}
          <ul class="today-events-list">
            {#each todayEvents as ev}
              <li class="today-event-item">
                <div>
                  <span class="today-event-title">{ev.title}</span>
                  {#if ev.description}
                    <span class="today-event-description">{ev.description}</span>
                  {/if}
                </div>
                {#if formatTimeRange(ev)}
                  <span class="today-event-time">{formatTimeRange(ev)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="today-empty">No scheduled events today. Use the calendar or journal entry to anchor the day.</p>
        {/if}

        <div class="today-actions">
          <button class="btn btn-primary" onclick={() => onNavigateToDate(todayString())}>
            Open today in calendar
          </button>
        </div>
      </article>
    </div>
  </section>

  {#if $progress.is_completed}
    <section class="report-panel card animate-rise rise-6" aria-labelledby="dashboard-report-title">
      <header class="section-head">
        <div>
          <h2 id="dashboard-report-title">Final report</h2>
          <p>The internship requirement is complete. Compile or download the PDF report from here.</p>
        </div>
      </header>

      <div class="report-panel-body">
        <p class="report-status">
          {#if compilationStatus?.has_report}
            A compiled report is ready to download.
          {:else}
            The report has not been compiled yet.
          {/if}
        </p>

        {#if compilationStatus?.has_report}
          <button class="btn btn-primary" onclick={handleDownload} disabled={downloading}>
            {downloading ? 'Downloading...' : 'Download report'}
          </button>
        {:else}
          <button class="btn btn-primary" onclick={handleCompile} disabled={compiling}>
            {compiling ? 'Compiling...' : 'Compile final report'}
          </button>
        {/if}
      </div>
    </section>
  {/if}

  {#if celebration}
    <div class="modal-overlay celebration-overlay" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div class="modal-content celebration-modal">
        <h2 id="celebration-title">{celebration.title}</h2>
        <p>{celebration.message}</p>
        <button class="btn btn-primary" onclick={closeCelebration}>Keep going</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    position: relative;
    width: min(1480px, calc(100vw - 2rem));
    margin: 0 auto;
    padding: clamp(1.35rem, 2vw, 2rem) clamp(1rem, 1.8vw, 1.65rem) clamp(3rem, 5vw, 4rem);
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 1.7vw, 1.4rem);
    overflow: hidden;
  }

  .dashboard-parallax {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .parallax-sheet,
  .parallax-orbit {
    position: absolute;
    border: 1px solid rgba(190, 53, 25, 0.08);
    background: rgba(255, 255, 255, 0.26);
  }

  .parallax-sheet {
    border-radius: 14px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .parallax-sheet-a {
    top: 4.4rem;
    left: -6rem;
    width: min(28rem, 34vw);
    height: 15rem;
    transform: translate3d(0, calc(var(--parallax-shift) * 0.045), 0) rotate(-7deg);
  }

  .parallax-sheet-b {
    top: 17rem;
    right: -7rem;
    width: min(34rem, 36vw);
    height: 19rem;
    transform: translate3d(0, calc(var(--parallax-shift) * -0.055), 0) rotate(8deg);
  }

  .parallax-sheet-c {
    bottom: 4rem;
    left: 18%;
    width: min(24rem, 28vw);
    height: 12rem;
    transform: translate3d(0, calc(var(--parallax-shift) * 0.03), 0) rotate(-5deg);
  }

  .parallax-orbit {
    border-radius: 999px;
    background: transparent;
  }

  .parallax-orbit-a {
    top: 7rem;
    right: 18%;
    width: 12rem;
    height: 12rem;
    transform: translate3d(0, calc(var(--parallax-shift) * -0.08), 0);
  }

  .parallax-orbit-b {
    bottom: 8rem;
    right: -2rem;
    width: 18rem;
    height: 18rem;
    transform: translate3d(0, calc(var(--parallax-shift) * 0.06), 0);
  }

  .parallax-rule {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: rgba(190, 53, 25, 0.12);
    transform-origin: center;
  }

  .parallax-rule-a {
    top: 7.8rem;
    transform: translate3d(0, calc(var(--parallax-shift) * 0.04), 0);
  }

  .parallax-rule-b {
    top: 29rem;
    left: 18%;
    right: 3%;
    transform: translate3d(0, calc(var(--parallax-shift) * -0.03), 0);
  }

  .parallax-rule-c {
    top: 47rem;
    left: 8%;
    right: 20%;
    transform: translate3d(0, calc(var(--parallax-shift) * 0.05), 0);
  }

  .dashboard-bar,
  .trajectory-panel,
  .month-panel,
  .milestones-panel,
  .snapshot-panel,
  .today-panel,
  .report-panel {
    position: relative;
    z-index: 1;
  }

  .dashboard :global(.card) {
    border-radius: 12px;
    background: rgba(255, 252, 246, 0.96);
    border-color: rgba(190, 53, 25, 0.1);
    box-shadow: 0 8px 24px rgba(34, 24, 8, 0.05);
  }

  .overview-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(19rem, 0.95fr);
    gap: 1rem;
    padding: 1.15rem 1.2rem;
  }

  .overview-copy {
    display: grid;
    gap: 0.45rem;
    align-content: start;
  }

  .overview-copy h2 {
    margin: 0;
    font-size: clamp(1.45rem, 2.4vw, 2rem);
  }

  .overview-copy p,
  .overview-secondary {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--dark-soft);
  }

  .overview-secondary {
    color: var(--dark-muted);
  }

  .overview-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .overview-metric {
    padding: 0.95rem 1rem;
    border: 1px solid rgba(190, 53, 25, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.64);
  }

  .overview-metric dt {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-muted);
  }

  .overview-metric dd {
    margin-top: 0.32rem;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2vw, 1.85rem);
    line-height: 1.05;
    color: var(--red);
  }

  .dashboard-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
    padding: 0.75rem 0 0.15rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.16);
  }

  .dashboard-bar-copy h1 {
    margin: 0;
    font-size: clamp(1.8rem, 3vw, 2.7rem);
    line-height: 1;
  }

  .dashboard-bar-copy p {
    margin-top: 0.35rem;
    max-width: 38rem;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    color: var(--dark-soft);
  }

  .dashboard-bar-controls {
    display: inline-flex;
    align-items: end;
    gap: 0.55rem;
  }

  .month-picker {
    display: grid;
    gap: 0.32rem;
  }

  .month-picker-label {
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--dark-soft);
  }

  .month-input {
    min-width: 11rem;
    min-height: 2.4rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(190, 53, 25, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.92);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }

  .month-input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(190, 53, 25, 0.12);
  }

  .dashboard-main-grid,
  .dashboard-lower-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(19rem, 0.9fr);
    gap: 1rem;
  }

  .parallax-plane {
    min-width: 0;
    will-change: transform;
  }

  .depth-1 {
    transform: translate3d(0, calc(var(--parallax-shift) * -0.014), 0);
  }

  .depth-2 {
    transform: translate3d(0, calc(var(--parallax-shift) * -0.024), 0);
  }

  .trajectory-panel,
  .month-panel,
  .snapshot-panel,
  .today-panel,
  .report-panel,
  .milestones-panel {
    padding: 1.15rem 1.2rem 1.25rem;
  }

  .panel-head,
  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  .panel-head h2,
  .section-head h2 {
    margin: 0;
    font-size: clamp(1.18rem, 1.7vw, 1.5rem);
  }

  .panel-head p,
  .section-head p,
  .section-meta,
  .month-panel-note,
  .snapshot-footnote,
  .report-status,
  .today-empty {
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--dark-soft);
  }

  .section-meta {
    text-align: right;
  }

  .trajectory-total {
    display: grid;
    justify-items: end;
    align-self: center;
  }

  .trajectory-total-value {
    font-family: var(--font-display);
    font-size: clamp(2.9rem, 6.5vw, 5rem);
    line-height: 0.88;
    color: var(--red);
  }

  .trajectory-total-unit {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dark-muted);
  }

  .trajectory-total-skeleton {
    display: grid;
    gap: 0.35rem;
    min-width: 8rem;
    justify-items: end;
  }

  .trajectory-rail {
    margin-top: 1rem;
    padding-bottom: 2rem;
  }

  .trajectory-rail-track {
    position: relative;
    height: 1rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    overflow: visible;
  }

  .trajectory-rail-fill {
    position: absolute;
    inset: 0 auto 0 0;
    display: block;
    border-radius: 999px;
    background: var(--red);
    transition: width 0.5s var(--ease-out);
  }

  .trajectory-marker {
    position: absolute;
    top: calc(100% + 0.15rem);
    transform: translateX(-50%);
    display: grid;
    justify-items: center;
    gap: 0.18rem;
    color: rgba(190, 53, 25, 0.48);
  }

  .trajectory-marker-line {
    width: 1px;
    height: 0.85rem;
    background: currentColor;
  }

  .trajectory-marker-label {
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .trajectory-marker.reached {
    color: var(--red);
  }

  .trajectory-ledger {
    margin-top: 0.2rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.75rem;
  }

  .trajectory-ledger div,
  .month-panel-tile,
  .snapshot-item {
    padding: 0.9rem 0.95rem;
    border: 1px solid rgba(190, 53, 25, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.64);
  }

  .trajectory-ledger dt,
  .month-panel-tile dt {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-muted);
  }

  .trajectory-ledger dd,
  .month-panel-tile dd {
    margin-top: 0.35rem;
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 2vw, 1.7rem);
    color: var(--red);
    line-height: 1.1;
  }

  .trajectory-ledger-loading {
    margin-top: 1.4rem;
  }

  .trajectory-ledger-loading div,
  .month-panel-tile-loading {
    display: grid;
    gap: 0.45rem;
  }

  .trajectory-skeleton-rail {
    height: 1rem;
    border-radius: 999px;
  }

  .month-panel-grid,
  .snapshot-grid {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
    gap: 0.75rem;
  }

  .month-panel-note {
    margin-top: 0.9rem;
    padding-top: 0.8rem;
    border-top: 1px solid rgba(190, 53, 25, 0.1);
  }

  .milestones-grid {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }

  .milestones-panel {
    overflow: visible;
  }

  .milestones-runway {
    position: relative;
    margin-top: 1rem;
    margin-bottom: 1.6rem;
    padding: 0 0 2.2rem;
  }

  .milestones-runway-track,
  .milestones-runway-fill {
    position: absolute;
    inset: 0 auto auto 0;
    height: 0.65rem;
    border-radius: 999px;
  }

  .milestones-runway-track {
    width: 100%;
    background: rgba(190, 53, 25, 0.08);
  }

  .milestones-runway-fill {
    background: rgba(190, 53, 25, 0.86);
    transition: width 0.5s var(--ease-out);
  }

  .milestones-runway-stop {
    position: absolute;
    top: 0.325rem;
    transform: translate(-50%, -50%);
    display: grid;
    justify-items: center;
    gap: 0.35rem;
    color: rgba(190, 53, 25, 0.48);
  }

  .milestones-runway-dot {
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 999px;
    border: 2px solid currentColor;
    background: var(--bg-soft);
  }

  .milestones-runway-label {
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .milestones-runway-stop.reached {
    color: var(--red);
  }

  .milestone-card {
    padding: 1rem;
    border: 1px solid rgba(190, 53, 25, 0.1);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.58);
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .milestone-card.reached {
    background: rgba(190, 53, 25, 0.06);
    border-color: rgba(190, 53, 25, 0.18);
  }

  .milestone-card h3 {
    margin: 0;
    font-size: 1.15rem;
  }

  .milestone-status {
    margin-top: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--red);
  }

  .milestone-note {
    margin-top: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--dark-soft);
  }

  .snapshot-value {
    display: block;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2vw, 1.8rem);
    line-height: 1.1;
    color: var(--red);
  }

  .snapshot-label {
    display: block;
    margin-top: 0.3rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-muted);
  }

  .snapshot-progress {
    margin-top: 1rem;
    padding-top: 0.95rem;
    border-top: 1px solid rgba(190, 53, 25, 0.1);
  }

  .snapshot-progress-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--dark-soft);
  }

  .snapshot-progress-track {
    margin-top: 0.55rem;
    height: 0.7rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    overflow: hidden;
  }

  .snapshot-progress-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.85);
    transition: width 0.5s var(--ease-out);
  }

  .snapshot-footnote {
    margin-top: 0.65rem;
  }

  .snapshot-loading-track {
    height: 0.7rem;
    border-radius: 999px;
  }

  .today-quote {
    margin-top: 1rem;
    padding: 0.95rem 0 1rem;
    border-top: 1px solid rgba(190, 53, 25, 0.1);
    border-bottom: 1px solid rgba(190, 53, 25, 0.1);
  }

  .today-quote blockquote {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.05rem;
    line-height: 1.45;
    color: var(--dark);
  }

  .today-quote cite {
    display: block;
    margin-top: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--dark-muted);
    font-style: normal;
  }

  .today-events-list {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  .today-event-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: start;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.08);
  }

  .today-event-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .today-event-title {
    display: block;
    font-weight: 600;
    color: var(--dark);
  }

  .today-event-description {
    display: block;
    margin-top: 0.18rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
  }

  .today-event-time {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--red);
    white-space: nowrap;
  }

  .today-actions,
  .report-panel-body {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .report-panel-body {
    justify-content: space-between;
  }

  .report-status {
    max-width: 40rem;
  }

  .today-events-skeleton,
  .snapshot-grid-loading,
  .month-panel-grid-loading {
    margin-top: 1rem;
  }

  .today-events-skeleton {
    display: grid;
    gap: 0.55rem;
  }

  .celebration-overlay {
    z-index: 25;
  }

  .celebration-modal {
    max-width: 460px;
    text-align: center;
    background: rgba(255, 252, 246, 0.98);
    border-color: rgba(190, 53, 25, 0.16);
    border-radius: 12px;
  }

  .celebration-modal h2 {
    margin: 0;
    font-size: clamp(1.7rem, 2.3vw, 2rem);
  }

  .celebration-modal p {
    margin: 0.75rem 0 1rem;
    font-family: var(--font-ui);
    line-height: 1.6;
    color: var(--dark-soft);
  }

  @media (max-width: 1180px) {
    .dashboard {
      width: min(100%, calc(100vw - 1rem));
    }

    .overview-panel,
    .dashboard-main-grid,
    .dashboard-lower-grid,
    .milestones-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-bar {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .section-meta {
      text-align: left;
    }

    .trajectory-ledger {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 860px) {
    .dashboard {
      width: calc(100vw - 0.5rem);
      padding-inline: 0.7rem;
    }

    .parallax-sheet-a,
    .parallax-sheet-b,
    .parallax-orbit-b {
      display: none;
    }

    .dashboard-bar-controls {
      flex-wrap: wrap;
      align-items: start;
    }

    .panel-head,
    .section-head {
      flex-direction: column;
    }

    .trajectory-total {
      justify-items: start;
    }

    .overview-metrics,
    .trajectory-ledger,
    .month-panel-grid,
    .snapshot-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 640px) {
    .dashboard {
      padding-top: 1rem;
      padding-bottom: 2rem;
    }

    .dashboard-bar-copy h1 {
      font-size: 1.6rem;
    }

    .dashboard-bar-copy p,
    .panel-head p,
    .section-head p,
    .report-status {
      font-size: 0.84rem;
    }

    .month-picker,
    .month-input {
      width: 100%;
    }

    .dashboard-bar-controls .btn {
      min-width: 5.25rem;
      justify-content: center;
    }

    .trajectory-total-value {
      font-size: 3.25rem;
    }

    .overview-metrics,
    .trajectory-ledger,
    .month-panel-grid,
    .snapshot-grid {
      grid-template-columns: 1fr;
    }

    .today-event-item {
      grid-template-columns: 1fr;
    }

    .today-event-time {
      white-space: normal;
    }

    .today-actions,
    .report-panel-body {
      flex-direction: column;
      align-items: stretch;
    }

    .today-actions .btn,
    .report-panel-body .btn {
      width: 100%;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .parallax-plane,
    .parallax-sheet,
    .parallax-orbit,
    .parallax-rule {
      transform: none !important;
    }

    .trajectory-rail-fill,
    .snapshot-progress-fill {
      transition: none;
    }
  }
</style>
