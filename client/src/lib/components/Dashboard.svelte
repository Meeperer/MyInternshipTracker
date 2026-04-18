<script>
  import { onMount, tick } from 'svelte';
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

  let compilationStatus = $state(null);
  let compiling = $state(false);
  let downloading = $state(false);
  let todayEvents = $state([]);
  let eventsLoading = $state(true);
  let celebration = $state(null);
  let activePanel = $state(null);

  let dashboardDialog;
  let dashboardCloseButton;
  let lastPanelTrigger = null;

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

  async function openPanel(panel, event) {
    activePanel = panel;

    if (typeof HTMLElement !== 'undefined' && event?.currentTarget instanceof HTMLElement) {
      lastPanelTrigger = event.currentTarget;
    }

    await tick();

    if (dashboardDialog && !dashboardDialog.open) {
      dashboardDialog.showModal();
    }

    dashboardCloseButton?.focus();
  }

  function closePanel() {
    dashboardDialog?.close();
  }

  function handleDialogClose() {
    activePanel = null;

    /* Returning focus to the trigger keeps the dialog flow predictable for
       keyboard users and matches WCAG 2.2 focus-order expectations. */
    if (lastPanelTrigger?.focus) {
      lastPanelTrigger.focus();
    }

    lastPanelTrigger = null;
  }

  function handleDialogCancel(event) {
    event.preventDefault();
    closePanel();
  }

  let targetHours = $derived($progress.target_hours || 486);
  let dashboardBusy = $derived($progress.loading || $journal.loading);
  let dashboardMonthLabel = $derived.by(() => formatMonthLabel($selectedMonth || monthValueFromDate()));

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

  let reachedMilestones = $derived.by(() => milestoneCards.filter((milestone) => milestone.reached).length);

  let panelCards = $derived.by(() => {
    const cards = [
      {
        id: 'progress',
        title: 'Progress',
        value: `${$progress.total_hours}h`,
        note: nextMilestone ? `${nextMilestone.remaining}h until ${nextMilestone.hours}h` : 'Target reached',
        meta: `${$progress.percentage}% of ${targetHours}h goal`
      },
      {
        id: 'month',
        title: dashboardMonthLabel,
        value: formatHours(monthStats.hours),
        note: `${monthStats.count} entries in view`,
        meta: `${monthInsights.activeDays} active days`
      },
      {
        id: 'milestones',
        title: 'Milestones',
        value: `${reachedMilestones}/${milestoneCards.length}`,
        note: nextMilestone ? `Next: ${nextMilestone.hours}h` : 'All hour markers reached',
        meta: `${$progress.current_streak}-day streak`
      },
      {
        id: 'today',
        title: 'Today',
        value: eventsLoading ? '...' : todayEvents.length > 0 ? `${todayEvents.length}` : 'Free',
        note: eventsLoading
          ? 'Checking today'
          : todayEvents.length > 0
            ? todayEvents[0].title
            : 'No scheduled events',
        meta: 'Open schedule'
      }
    ];

    if ($progress.is_completed) {
      cards.push({
        id: 'report',
        title: 'Final report',
        value: compilationStatus?.has_report ? 'Ready' : 'Compile',
        note: compilationStatus?.has_report ? 'Download the PDF report' : 'Generate the final PDF',
        meta: 'Open report actions'
      });
    }

    return cards;
  });

  let panelTitle = $derived.by(() => {
    if (activePanel === 'progress') return 'Progress details';
    if (activePanel === 'month') return `${dashboardMonthLabel} details`;
    if (activePanel === 'milestones') return 'Milestones';
    if (activePanel === 'today') return 'Today';
    if (activePanel === 'report') return 'Final report';
    return 'Dashboard details';
  });

  let panelDescription = $derived.by(() => {
    if (activePanel === 'progress') return 'Current totals, projection, and pace.';
    if (activePanel === 'month') return 'The selected month broken down a little further.';
    if (activePanel === 'milestones') return 'Progress against the long-term hour markers and streaks.';
    if (activePanel === 'today') return 'Everything scheduled for today.';
    if (activePanel === 'report') return 'Compile or download the final internship PDF.';
    return '';
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

  <section class="summary-panel card animate-rise rise-2" aria-labelledby="dashboard-summary-title">
    <div class="summary-copy">
      <h2 id="dashboard-summary-title">{greetingLabel}</h2>
      <p>{summaryLine}</p>
      <p class="summary-secondary">{nextActionLine}</p>
    </div>

    {#if dashboardBusy}
      <div class="summary-inline summary-inline-loading" aria-hidden="true">
        {#each Array.from({ length: 3 }) as _}
          <div class="summary-chip">
            <span class="skeleton-line short"></span>
            <span class="skeleton-line medium"></span>
          </div>
        {/each}
      </div>
    {:else}
      <dl class="summary-inline">
        <div class="summary-chip">
          <dt>Total logged</dt>
          <dd>{$progress.total_hours}h</dd>
        </div>
        <div class="summary-chip">
          <dt>Remaining</dt>
          <dd>{$progress.remaining_hours}h</dd>
        </div>
        <div class="summary-chip">
          <dt>This month</dt>
          <dd>{formatHours(monthStats.hours)}</dd>
        </div>
      </dl>
    {/if}
  </section>

  <section class="section-grid animate-rise rise-3" aria-label="Dashboard sections">
    {#if dashboardBusy}
      {#each Array.from({ length: 4 }) as _}
        <div class="section-card card section-card-loading" aria-hidden="true">
          <span class="skeleton-line short"></span>
          <span class="skeleton-line medium"></span>
          <span class="skeleton-line long"></span>
        </div>
      {/each}
    {:else}
      {#each panelCards as card}
        <button
          type="button"
          class="section-card card"
          aria-haspopup="dialog"
          onclick={(event) => openPanel(card.id, event)}
        >
          <span class="section-card-head">
            <span class="section-card-title">{card.title}</span>
            <span class="section-card-link">View details</span>
          </span>
          <strong class="section-card-value">{card.value}</strong>
          <span class="section-card-note">{card.note}</span>
          <span class="section-card-meta">{card.meta}</span>
        </button>
      {/each}
    {/if}
  </section>

  <!-- A native dialog gives screen readers and keyboard users the expected
       modal behavior without recreating those semantics by hand. -->
  <dialog
    bind:this={dashboardDialog}
    class="dashboard-dialog"
    aria-labelledby="dashboard-panel-title"
    onclose={handleDialogClose}
    oncancel={handleDialogCancel}
  >
    <div class="dialog-panel">
      <header class="dialog-head">
        <div>
          <h2 id="dashboard-panel-title">{panelTitle}</h2>
          {#if panelDescription}
            <p>{panelDescription}</p>
          {/if}
        </div>

        <button bind:this={dashboardCloseButton} type="button" class="btn btn-sm" onclick={closePanel}>
          Close
        </button>
      </header>

      <div class="dialog-body">
        {#if activePanel === 'progress'}
          {#if dashboardBusy}
            <div class="panel-loading" aria-hidden="true">
              <div class="skeleton-block track-skeleton"></div>
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
            <div class="dialog-stack">
              <div class="progress-block">
                <div class="progress-block-head">
                  <strong>{$progress.total_hours} hours logged</strong>
                  <span>{$progress.percentage}% complete</span>
                </div>
                <div class="trajectory-track" aria-hidden="true">
                  <span class="trajectory-fill" style={`width: ${Math.min($progress.percentage, 100)}%`}></span>
                </div>
                <div class="trajectory-scale">
                  <span>0h</span>
                  <span>{nextMilestone ? `${nextMilestone.hours}h next` : 'Goal complete'}</span>
                  <span>{targetHours}h</span>
                </div>
              </div>

              <dl class="detail-grid">
                <div class="detail-card">
                  <dt>Status</dt>
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
            </div>
          {/if}
        {:else if activePanel === 'month'}
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
            <div class="dialog-stack">
              <dl class="detail-grid">
                <div class="detail-card">
                  <dt>Hours this month</dt>
                  <dd>{formatHours(monthInsights.totalHours)}</dd>
                </div>
                <div class="detail-card">
                  <dt>Entries</dt>
                  <dd>{monthStats.count}</dd>
                </div>
                <div class="detail-card">
                  <dt>Finished days</dt>
                  <dd>{monthInsights.finishedDays}</dd>
                </div>
                <div class="detail-card">
                  <dt>Active days</dt>
                  <dd>{monthInsights.activeDays}</dd>
                </div>
                <div class="detail-card">
                  <dt>Month share</dt>
                  <dd>{monthShare}%</dd>
                </div>
                <div class="detail-card">
                  <dt>Cadence</dt>
                  <dd>{cadenceLabel}</dd>
                </div>
              </dl>

              <p class="dialog-note">
                {#if monthStats.count > 0}
                  {completionRate}% of this month&apos;s entries are finished and already contributing to the target.
                {:else}
                  This month has not started contributing yet.
                {/if}
              </p>
            </div>
          {/if}
        {:else if activePanel === 'milestones'}
          <div class="dialog-stack">
            <div class="milestone-summary">
              <span>{reachedMilestones} of {milestoneCards.length} hour markers reached</span>
              <span>{$progress.current_streak}-day current streak</span>
              <span>{$progress.longest_streak}-day best streak</span>
            </div>

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
        {:else if activePanel === 'today'}
          <div class="dialog-stack">
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
          </div>
        {:else if activePanel === 'report' && $progress.is_completed}
          <div class="dialog-stack">
            <p class="dialog-note">
              {#if compilationStatus?.has_report}
                A compiled report is ready to download.
              {:else}
                The report has not been compiled yet.
              {/if}
            </p>

            <div class="report-actions">
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
        {/if}
      </div>
    </div>
  </dialog>

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
    width: min(1100px, calc(100vw - 2rem));
    margin: 0 auto;
    padding: clamp(1.1rem, 2vw, 1.7rem) clamp(1rem, 1.8vw, 1.4rem) clamp(2rem, 3vw, 2.8rem);
    display: grid;
    gap: 1rem;
    background: transparent;
  }

  .dashboard :global(.card) {
    border-radius: 12px;
    border: 1px solid rgba(190, 53, 25, 0.08);
    background: rgba(255, 252, 246, 0.98);
    box-shadow: none;
  }

  .dashboard :global(.card)::before {
    display: none;
  }

  .dashboard-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
  }

  .dashboard-header-copy h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.4rem);
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
  .summary-chip dt,
  .detail-card dt {
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

  .summary-panel {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(16rem, auto);
    gap: 1rem;
    align-items: start;
    padding: 1.1rem 1.15rem;
  }

  .summary-copy {
    display: grid;
    gap: 0.35rem;
  }

  .summary-copy h2,
  .dialog-head h2 {
    margin: 0;
    font-size: clamp(1.25rem, 2vw, 1.75rem);
  }

  .summary-copy p,
  .dialog-head p,
  .dialog-note,
  .today-empty,
  .milestone-note,
  .milestone-status,
  .today-event-description {
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--dark-soft);
  }

  .summary-secondary {
    color: var(--dark-muted);
  }

  .summary-inline {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .summary-chip {
    padding: 0.8rem 0.9rem;
    border: 1px solid rgba(190, 53, 25, 0.08);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
  }

  .summary-inline-loading .summary-chip,
  .detail-grid-loading .detail-card {
    display: grid;
    gap: 0.45rem;
  }

  .summary-chip dd,
  .detail-card dd {
    margin-top: 0.28rem;
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 1.9vw, 1.65rem);
    line-height: 1.08;
    color: var(--red);
  }

  .section-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .section-card {
    width: 100%;
    display: grid;
    gap: 0.45rem;
    padding: 1rem 1.05rem;
    text-align: left;
    cursor: pointer;
    transition: border-color 160ms ease, background-color 160ms ease;
  }

  .section-card:hover,
  .section-card:focus-visible {
    border-color: rgba(190, 53, 25, 0.18);
    background: rgba(255, 255, 255, 1);
    outline: none;
  }

  .section-card-loading {
    min-height: 11.5rem;
    align-content: start;
  }

  .section-card-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .section-card-title {
    font-weight: 600;
    color: var(--dark);
  }

  .section-card-link,
  .section-card-meta,
  .trajectory-scale,
  .progress-block-head,
  .milestone-summary,
  .today-event-time {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-muted);
  }

  .section-card-value {
    font-family: var(--font-display);
    font-size: clamp(2rem, 4vw, 2.75rem);
    line-height: 0.95;
    color: var(--red);
  }

  .section-card-note {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--dark-soft);
    line-height: 1.45;
  }

  .dashboard-dialog {
    width: min(760px, calc(100vw - 1.5rem));
    padding: 0;
    border: none;
    background: transparent;
  }

  .dashboard-dialog::backdrop {
    background: rgba(28, 20, 7, 0.42);
  }

  .dialog-panel {
    border: 1px solid rgba(190, 53, 25, 0.12);
    border-radius: 14px;
    background: rgba(255, 252, 246, 1);
    padding: 1.1rem 1.15rem 1.2rem;
  }

  .dialog-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  .dialog-body {
    margin-top: 1rem;
    max-height: min(68vh, 46rem);
    overflow: auto;
    padding-right: 0.15rem;
  }

  .dialog-stack,
  .panel-loading {
    display: grid;
    gap: 0.9rem;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .detail-card,
  .milestone-card {
    padding: 0.9rem 0.95rem;
    border: 1px solid rgba(190, 53, 25, 0.08);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
  }

  .progress-block {
    display: grid;
    gap: 0.55rem;
  }

  .progress-block-head,
  .trajectory-scale,
  .milestone-summary {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .progress-block-head strong {
    color: var(--dark);
  }

  .trajectory-track {
    height: 0.8rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    overflow: hidden;
  }

  .trajectory-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--red);
    transition: width 0.45s var(--ease-out);
  }

  .track-skeleton {
    height: 0.8rem;
    border-radius: 999px;
  }

  .milestone-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0.75rem;
  }

  .milestone-card.reached {
    background: rgba(190, 53, 25, 0.07);
    border-color: rgba(190, 53, 25, 0.15);
  }

  .milestone-card h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .milestone-status {
    margin-top: 0.3rem;
    color: var(--red);
    font-weight: 600;
  }

  .milestone-note {
    margin-top: 0.35rem;
  }

  .today-events {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .today-event {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.85rem;
    align-items: start;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.08);
  }

  .today-event:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .today-event-title {
    display: block;
    font-weight: 600;
    color: var(--dark);
  }

  .today-event-time {
    color: var(--red);
    white-space: nowrap;
  }

  .today-actions,
  .report-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
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

  @media (max-width: 820px) {
    .dashboard {
      width: calc(100vw - 1rem);
      padding-inline: 0.75rem;
    }

    .dashboard-header,
    .summary-panel {
      grid-template-columns: 1fr;
    }

    .dashboard-controls,
    .dialog-head {
      flex-wrap: wrap;
      align-items: start;
    }
  }

  @media (max-width: 640px) {
    .summary-inline,
    .detail-grid {
      grid-template-columns: 1fr;
    }

    .today-event {
      grid-template-columns: 1fr;
    }

    .today-event-time {
      white-space: normal;
    }

    .today-actions,
    .report-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .today-actions .btn,
    .report-actions .btn,
    .dialog-head .btn {
      width: 100%;
      justify-content: center;
    }

    .month-picker,
    .month-input {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .section-card,
    .trajectory-fill {
      transition: none;
    }
  }
</style>
