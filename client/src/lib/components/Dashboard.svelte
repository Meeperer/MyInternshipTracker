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
  const QUOTES = [
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: "It always seems impossible until it's done.", author: 'Nelson Mandela' },
    { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Robin Sharma' },
    { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
    { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' }
  ];

  let compilationStatus = $state(null);
  let compiling = $state(false);
  let downloading = $state(false);
  let todayEvents = $state([]);
  let eventsLoading = $state(true);
  let celebration = $state(null);

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long'
  });

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

  let targetHours = $derived($progress.target_hours || 486);
  let dashboardBusy = $derived($progress.loading || $journal.loading);
  let dashboardMonthLabel = $derived.by(() => formatMonthLabel($selectedMonth || monthValueFromDate()));
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
    const averagePerActiveDay = activeEntries.length > 0 ? totalHours / activeEntries.length : 0;
    const avgDaily = $progress.days_completed > 0 ? $progress.total_hours / $progress.days_completed : 8;
    const workingDaysNeeded = avgDaily > 0 ? Math.ceil($progress.remaining_hours / avgDaily) : 0;

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
      activeDays: activeEntries.length,
      finishedDays: entries.filter((entry) => entry.status === 'finished').length,
      averagePerActiveDay: Math.round(averagePerActiveDay * 10) / 10,
      projectedCompletion: projectedDate,
      daysNeeded: workingDaysNeeded
    };
  });

  let completionRate = $derived.by(() =>
    monthStats.count > 0 ? Math.round((monthStats.finished / monthStats.count) * 100) : 0
  );

  let monthShare = $derived.by(() =>
    targetHours > 0 ? Math.min(100, Math.round((monthInsights.totalHours / targetHours) * 100)) : 0
  );

  let greetingLabel = $derived.by(() => {
    const pct = $progress.percentage;
    if (pct >= 100) return 'Requirement complete';
    if (pct >= 75) return 'Closing stretch';
    if (pct >= 50) return 'Halfway through';
    if (pct >= 25) return 'Solid start';
    return 'Early run';
  });

  let cadenceLabel = $derived.by(() => {
    const avg = monthInsights.averagePerActiveDay;
    if (avg >= 8) return 'Full-day pace';
    if (avg >= 5) return 'Steady pace';
    if (avg >= 2.5) return 'Building pace';
    if (avg > 0) return 'Light pace';
    return 'No pace yet';
  });

  let milestoneCards = $derived.by(() =>
    HOURS_MILESTONES.map((hours) => ({
      hours,
      reached: $progress.total_hours >= hours,
      remaining: Math.max(0, hours - $progress.total_hours)
    }))
  );

  let reachedMilestones = $derived.by(() => milestoneCards.filter((milestone) => milestone.reached).length);
  let nextMilestone = $derived.by(() => milestoneCards.find((milestone) => !milestone.reached) || null);

  let summaryLine = $derived.by(() => {
    if (monthStats.count === 0) {
      return `${dashboardMonthLabel} has no entries yet. Start the month from the journal or calendar.`;
    }

    return `${dashboardMonthLabel} includes ${monthStats.count} entries, ${formatHours(monthStats.hours)} logged, and ${monthStats.finished} finished days already counting toward the requirement.`;
  });

  let nextActionLine = $derived.by(() => {
    if ($progress.is_completed) {
      return 'The hours requirement is done, so the dashboard can shift from accumulation to final review.';
    }

    if (nextMilestone) {
      return `${nextMilestone.remaining} hours remain before the ${nextMilestone.hours}-hour milestone is cleared.`;
    }

    return 'Every milestone has already been reached.';
  });

  let todaySummary = $derived.by(() => {
    if (eventsLoading) return 'Loading today';
    if (todayEvents.length === 0) return 'No scheduled events today';
    return `${todayEvents.length} event${todayEvents.length === 1 ? '' : 's'} scheduled today`;
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
          ? 'You hit the full internship target. The dashboard can shift to final report work now.'
          : `Your total just crossed ${newestHoursMilestone} hours. The running record now shows real momentum.`
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
        message: `You have stayed consistent for ${newestStreakMilestone} days in a row. That consistency is now visible in the progress record.`
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
  });
</script>

<div class="dashboard" aria-busy={dashboardBusy || eventsLoading}>
  <header class="dashboard-header animate-rise rise-1">
    <div class="dashboard-header-copy">
      <h1>Dashboard</h1>
      <p>{dashboardMonthLabel}. {$progress.total_hours} of {targetHours} hours logged, {$progress.remaining_hours} remaining.</p>
    </div>

    <div class="dashboard-controls" role="group" aria-label="Selected month controls">
      <button type="button" class="btn btn-sm" onclick={() => shiftSelectedMonth(-1)}>
        Prev
      </button>

      <!-- Native month input keeps month selection predictable for keyboard and screen-reader users. -->
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

  <section class="summary-band card animate-rise rise-2" aria-labelledby="dashboard-summary-title">
    <div class="summary-copy">
      <h2 id="dashboard-summary-title">{greetingLabel}</h2>
      <p>{summaryLine}</p>
      <p class="summary-secondary">{nextActionLine}</p>
    </div>

    {#if dashboardBusy}
      <div class="summary-stats summary-stats-loading" aria-hidden="true">
        {#each Array.from({ length: 4 }) as _}
          <div class="summary-stat">
            <span class="skeleton-line short"></span>
            <span class="skeleton-line medium"></span>
          </div>
        {/each}
      </div>
    {:else}
      <dl class="summary-stats">
        <div class="summary-stat">
          <dt>Total logged</dt>
          <dd>{$progress.total_hours}</dd>
        </div>
        <div class="summary-stat">
          <dt>Remaining</dt>
          <dd>{$progress.remaining_hours}</dd>
        </div>
        <div class="summary-stat">
          <dt>This month</dt>
          <dd>{formatHours(monthStats.hours)}</dd>
        </div>
        <div class="summary-stat">
          <dt>Current streak</dt>
          <dd>{$progress.current_streak}d</dd>
        </div>
      </dl>
    {/if}
  </section>

  <section class="dashboard-grid animate-rise rise-3" aria-label="Progress and month overview">
    <article class="trajectory-panel card" aria-labelledby="trajectory-title">
      <header class="panel-head panel-head-split">
        <div>
          <h2 id="trajectory-title">Trajectory</h2>
          <p>
            {#if nextMilestone}
              {nextMilestone.remaining} hours until the {nextMilestone.hours}-hour milestone.
            {:else}
              Every milestone is already complete.
            {/if}
          </p>
        </div>

        {#if dashboardBusy}
          <div class="headline-skeleton" aria-hidden="true">
            <span class="skeleton-line short"></span>
            <span class="skeleton-line medium"></span>
          </div>
        {:else}
          <div class="headline-metric">
            <span class="headline-value">{$progress.total_hours}</span>
            <span class="headline-label">Hours logged</span>
          </div>
        {/if}
      </header>

      {#if dashboardBusy}
        <div class="panel-loading" aria-hidden="true">
          <div class="skeleton-block track-skeleton"></div>
          <div class="skeleton-line long"></div>
          <div class="detail-grid detail-grid-loading">
            {#each Array.from({ length: 4 }) as _}
              <div class="detail-card">
                <span class="skeleton-line short"></span>
                <span class="skeleton-line medium"></span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="trajectory-progress">
          <div class="trajectory-track" aria-hidden="true">
            <span class="trajectory-fill" style={`width: ${Math.min($progress.percentage, 100)}%`}></span>
          </div>
          <div class="trajectory-scale">
            <span>0h</span>
            <span>{nextMilestone ? `${nextMilestone.hours}h next` : 'Target reached'}</span>
            <span>{targetHours}h</span>
          </div>
        </div>

        <dl class="detail-grid">
          <div class="detail-card">
            <dt>Current status</dt>
            <dd>{greetingLabel}</dd>
          </div>
          <div class="detail-card">
            <dt>Projected finish</dt>
            <dd>{monthInsights.projectedCompletion}</dd>
          </div>
          <div class="detail-card">
            <dt>Average active day</dt>
            <dd>{formatHours(monthInsights.averagePerActiveDay)}</dd>
          </div>
          <div class="detail-card">
            <dt>Current streak</dt>
            <dd>{$progress.current_streak} days</dd>
          </div>
        </dl>
      {/if}
    </article>

    <article class="month-panel card" aria-labelledby="month-panel-title">
      <header class="panel-head">
        <div>
          <h2 id="month-panel-title">{dashboardMonthLabel}</h2>
          <p>{monthStats.count} entries currently in view.</p>
        </div>
      </header>

      {#if dashboardBusy}
        <div class="detail-grid detail-grid-loading" aria-hidden="true">
          {#each Array.from({ length: 4 }) as _}
            <div class="detail-card">
              <span class="skeleton-line short"></span>
              <span class="skeleton-line medium"></span>
            </div>
          {/each}
        </div>
      {:else}
        <dl class="detail-grid detail-grid-compact">
          <div class="detail-card">
            <dt>Hours this month</dt>
            <dd>{formatHours(monthStats.hours)}</dd>
          </div>
          <div class="detail-card">
            <dt>Finished days</dt>
            <dd>{monthStats.finished}</dd>
          </div>
          <div class="detail-card">
            <dt>Active days</dt>
            <dd>{monthInsights.activeDays}</dd>
          </div>
          <div class="detail-card">
            <dt>Month share of goal</dt>
            <dd>{monthShare}%</dd>
          </div>
        </dl>
      {/if}

      <p class="panel-note">
        {#if monthStats.count > 0}
          {completionRate}% of this month&apos;s entries are finished and already counting toward the target.
        {:else}
          Nothing in this month is contributing yet.
        {/if}
      </p>
    </article>
  </section>

  <section class="dashboard-lower-grid animate-rise rise-4" aria-label="Today, milestones, and month details">
    <aside class="today-panel card" aria-labelledby="today-title">
      <header class="panel-head">
        <div>
          <h2 id="today-title">Today</h2>
          <p>{todaySummary}</p>
        </div>
      </header>

      <div class="today-quote">
        <blockquote>{todayQuote.text}</blockquote>
        <cite>{todayQuote.author}</cite>
      </div>

      {#if eventsLoading}
        <div class="panel-loading" aria-hidden="true">
          <div class="skeleton-line long"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
      {:else if todayEvents.length > 0}
        <ul class="today-events">
          {#each todayEvents as ev}
            <li class="today-event">
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
        <p class="today-empty">No scheduled events today. Open the calendar or journal when you want to anchor the day.</p>
      {/if}

      <div class="today-actions">
        <button class="btn btn-primary" onclick={() => onNavigateToDate(todayString())}>
          Open today in calendar
        </button>
      </div>
    </aside>

    <div class="accordion-stack">
      <!-- Native details/summary keeps the accordion keyboard-friendly and readable
           without needing custom ARIA or key handling. -->
      <details class="accordion-card card">
        <summary class="accordion-summary">
          <span>
            <strong>Milestones</strong>
            <span class="accordion-subtitle">{reachedMilestones} of {milestoneCards.length} hour markers reached</span>
          </span>
          <span class="accordion-meta">{$progress.current_streak}-day streak</span>
        </summary>

        <div class="accordion-body">
          <div class="milestone-list">
            {#each milestoneCards as milestone}
              <article class:reached={milestone.reached} class="milestone-card">
                <h3>{milestone.hours} hours</h3>
                <p class="milestone-status">
                  {milestone.reached ? 'Reached' : `${milestone.remaining} hours left`}
                </p>
                <p class="milestone-note">
                  {#if milestone.reached}
                    This marker is already locked into the record.
                  {:else if milestone.remaining <= 24}
                    Close enough to plan around now.
                  {:else}
                    Still ahead, but clearly visible from here.
                  {/if}
                </p>
              </article>
            {/each}
          </div>
        </div>
      </details>

      <details class="accordion-card card">
        <summary class="accordion-summary">
          <span>
            <strong>Month snapshot</strong>
            <span class="accordion-subtitle">{formatHours(monthInsights.totalHours)} across {monthInsights.activeDays} active days</span>
          </span>
          <span class="accordion-meta">{monthShare}% of goal</span>
        </summary>

        <div class="accordion-body">
          {#if dashboardBusy}
            <div class="detail-grid detail-grid-loading" aria-hidden="true">
              {#each Array.from({ length: 4 }) as _}
                <div class="detail-card">
                  <span class="skeleton-line short"></span>
                  <span class="skeleton-line medium"></span>
                </div>
              {/each}
            </div>
            <div class="panel-loading" aria-hidden="true">
              <div class="skeleton-line medium"></div>
              <div class="skeleton-block track-skeleton"></div>
              <div class="skeleton-line long"></div>
            </div>
          {:else}
            <dl class="detail-grid">
              <div class="detail-card">
                <dt>Hours logged</dt>
                <dd>{formatHours(monthInsights.totalHours)}</dd>
              </div>
              <div class="detail-card">
                <dt>Days active</dt>
                <dd>{monthInsights.activeDays}</dd>
              </div>
              <div class="detail-card">
                <dt>Days finished</dt>
                <dd>{monthInsights.finishedDays}</dd>
              </div>
              <div class="detail-card">
                <dt>Current cadence</dt>
                <dd>{cadenceLabel}</dd>
              </div>
            </dl>

            <div class="snapshot-progress">
              <div class="snapshot-progress-head">
                <span>This month contributes {monthShare}% of the internship goal.</span>
                <span>{formatHours(monthInsights.totalHours)}</span>
              </div>
              <div class="snapshot-track" aria-hidden="true">
                <span class="snapshot-fill" style={`width: ${monthShare}%`}></span>
              </div>
              <p class="panel-note">
                {#if !$progress.is_completed}
                  At your current pace, the projected finish lands around {monthInsights.projectedCompletion}.
                {:else}
                  The target is complete, so this month is now part of the final record.
                {/if}
              </p>
            </div>
          {/if}
        </div>
      </details>

      {#if $progress.is_completed}
        <details class="accordion-card card">
          <summary class="accordion-summary">
            <span>
              <strong>Final report</strong>
              <span class="accordion-subtitle">
                {#if compilationStatus?.has_report}
                  Report ready to download
                {:else}
                  Compile the PDF report
                {/if}
              </span>
            </span>
            <span class="accordion-meta">
              {#if compilationStatus?.has_report}
                Ready
              {:else}
                Pending
              {/if}
            </span>
          </summary>

          <div class="accordion-body">
            <div class="report-actions">
              <p class="panel-note">
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
          </div>
        </details>
      {/if}
    </div>
  </section>

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
    width: calc(100% - 0.75rem);
    margin: 0 auto;
    min-height: calc(100dvh - 6rem);
    padding: clamp(0.9rem, 1.6vw, 1.35rem) clamp(0.85rem, 1.2vw, 1rem) clamp(1.35rem, 3vw, 2rem);
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: transparent;
  }

  .dashboard :global(.card) {
    border-radius: 12px;
    border-color: rgba(190, 53, 25, 0.08);
    background: rgba(255, 252, 246, 0.98);
    box-shadow: none;
    padding: 1.2rem;
  }

  .dashboard :global(.card)::before {
    display: none;
  }

  .dashboard :global(.card:hover) {
    box-shadow: none;
    border-color: rgba(190, 53, 25, 0.12);
  }

  .dashboard-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
  }

  .dashboard-header-copy h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.7rem);
  }

  .dashboard-header-copy p {
    margin-top: 0.28rem;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    color: var(--dark-soft);
  }

  .dashboard-controls {
    display: inline-flex;
    align-items: end;
    gap: 0.55rem;
  }

  .month-picker {
    display: grid;
    gap: 0.3rem;
  }

  .month-picker-label,
  .detail-card dt,
  .summary-stat dt {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-muted);
  }

  .month-input {
    min-width: 11rem;
    min-height: 2.4rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid rgba(190, 53, 25, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.94);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.9rem;
  }

  .month-input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(190, 53, 25, 0.12);
  }

  .summary-band,
  .dashboard-grid,
  .dashboard-lower-grid {
    position: relative;
  }

  .summary-band {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.95fr);
    gap: 1rem;
    align-items: start;
  }

  .summary-copy {
    display: grid;
    gap: 0.4rem;
  }

  .summary-copy h2,
  .panel-head h2 {
    margin: 0;
    font-size: clamp(1.35rem, 2vw, 1.9rem);
  }

  .summary-copy p,
  .panel-head p,
  .panel-note,
  .today-empty {
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--dark-soft);
  }

  .summary-secondary {
    color: var(--dark-muted);
  }

  .summary-stats,
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .summary-stat,
  .detail-card,
  .milestone-card {
    padding: 0.9rem 0.95rem;
    border: 1px solid rgba(190, 53, 25, 0.08);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.7);
  }

  .summary-stats-loading .summary-stat,
  .detail-grid-loading .detail-card {
    display: grid;
    gap: 0.45rem;
  }

  .summary-stat dd,
  .detail-card dd {
    margin-top: 0.3rem;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2vw, 1.8rem);
    line-height: 1.08;
    color: var(--red);
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(18rem, 0.95fr);
    gap: 1rem;
  }

  .dashboard-lower-grid {
    display: grid;
    grid-template-columns: minmax(19rem, 0.9fr) minmax(0, 1.1fr);
    gap: 1rem;
    align-items: start;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  .panel-head-split {
    align-items: end;
  }

  .headline-metric {
    display: grid;
    justify-items: end;
    min-width: 8rem;
  }

  .headline-value {
    font-family: var(--font-display);
    font-size: clamp(3rem, 6vw, 5rem);
    line-height: 0.88;
    color: var(--red);
  }

  .headline-label {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-muted);
  }

  .headline-skeleton {
    display: grid;
    gap: 0.35rem;
    min-width: 8rem;
    justify-items: end;
  }

  .panel-loading {
    display: grid;
    gap: 0.7rem;
    margin-top: 1rem;
  }

  .track-skeleton {
    height: 0.8rem;
    border-radius: 999px;
  }

  .trajectory-progress {
    margin-top: 1rem;
  }

  .trajectory-track,
  .snapshot-track {
    height: 0.8rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    overflow: hidden;
  }

  .trajectory-fill,
  .snapshot-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--red);
    transition: width 0.45s var(--ease-out);
  }

  .trajectory-scale,
  .snapshot-progress-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.5rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
  }

  .detail-grid {
    margin-top: 1rem;
  }

  .detail-grid-compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-note {
    margin-top: 0.85rem;
  }

  .today-panel {
    display: grid;
    align-content: start;
  }

  .today-quote {
    margin-top: 0.9rem;
    padding: 0.9rem 0;
    border-top: 1px solid rgba(190, 53, 25, 0.08);
    border-bottom: 1px solid rgba(190, 53, 25, 0.08);
  }

  .today-quote blockquote {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.02rem;
    line-height: 1.45;
    color: var(--dark);
  }

  .today-quote cite {
    display: block;
    margin-top: 0.42rem;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--dark-muted);
    font-style: normal;
  }

  .accordion-stack {
    display: grid;
    gap: 0.75rem;
    align-content: start;
  }

  .accordion-card {
    padding: 0;
    overflow: hidden;
  }

  .accordion-summary {
    list-style: none;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    padding: 0.95rem 1.1rem;
    cursor: pointer;
  }

  .accordion-summary::-webkit-details-marker {
    display: none;
  }

  .accordion-summary::marker {
    content: '';
  }

  .accordion-summary::after {
    content: '+';
    flex: 0 0 auto;
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 700;
    color: var(--red);
  }

  .accordion-card[open] .accordion-summary::after {
    content: '-';
  }

  .accordion-summary > span:first-child {
    display: grid;
    gap: 0.18rem;
  }

  .accordion-summary strong {
    font-size: 1rem;
    color: var(--dark);
  }

  .accordion-subtitle,
  .accordion-meta {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--dark-soft);
  }

  .accordion-meta {
    padding-right: 0.4rem;
    text-align: right;
  }

  .accordion-body {
    padding: 0 1.1rem 1.05rem;
    border-top: 1px solid rgba(190, 53, 25, 0.08);
  }

  .milestone-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.75rem;
    margin-top: 0.85rem;
  }

  .milestone-card.reached {
    background: rgba(190, 53, 25, 0.07);
    border-color: rgba(190, 53, 25, 0.16);
  }

  .milestone-card h3 {
    margin: 0;
    font-size: 1.12rem;
  }

  .milestone-status {
    margin-top: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--red);
  }

  .milestone-note {
    margin-top: 0.4rem;
    font-family: var(--font-ui);
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--dark-soft);
  }

  .today-events {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  .today-event {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: start;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.08);
  }

  .today-event:last-child {
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
    margin-top: 0.16rem;
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
  .report-actions {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .report-actions {
    justify-content: space-between;
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

  @media (max-width: 1100px) {
    .summary-band,
    .dashboard-grid,
    .dashboard-lower-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .dashboard {
      width: calc(100% - 0.75rem);
      padding-inline: 0.75rem;
    }

    .dashboard-header {
      grid-template-columns: 1fr;
      align-items: start;
    }

    .dashboard-controls {
      flex-wrap: wrap;
      align-items: start;
    }

    .panel-head,
    .panel-head-split {
      flex-direction: column;
      align-items: start;
    }

    .accordion-summary {
      align-items: start;
    }

    .accordion-meta {
      text-align: left;
      padding-right: 0;
    }

    .headline-metric,
    .headline-skeleton {
      justify-items: start;
    }

    .summary-stats,
    .detail-grid,
    .detail-grid-compact {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 560px) {
    .dashboard-header-copy h1 {
      font-size: 1.7rem;
    }

    .month-picker,
    .month-input {
      width: 100%;
    }

    .dashboard-controls .btn {
      min-width: 5.25rem;
      justify-content: center;
    }

    .summary-stats,
    .detail-grid,
    .detail-grid-compact {
      grid-template-columns: 1fr;
    }

    .today-event {
      grid-template-columns: 1fr;
    }

    .today-event-time {
      white-space: normal;
    }

    .accordion-summary {
      flex-direction: column;
      align-items: start;
    }

    .today-actions,
    .report-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .today-actions .btn,
    .report-actions .btn {
      width: 100%;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trajectory-fill,
    .snapshot-fill {
      transition: none;
    }
  }
</style>
