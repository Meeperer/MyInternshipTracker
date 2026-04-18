<script>
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import { events } from '$stores/events.js';
  import { appCommands } from '$stores/appCommands.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { toast } from '$stores/toast.js';
  import { monthValueFromDate, parseMonthValue, todayString } from '$utils/date.js';
  import { api } from '$utils/api.js';

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
  let dashboardDialog = $state();
  let activeDashboardPanel = $state(null);
  let dashboardDialogTrigger = $state(null);

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long'
  });

  function formatMonthLabel(monthValue) {
    const { year, month } = parseMonthValue(monthValue);
    return MONTH_LABEL_FORMATTER.format(new Date(year, (month || 1) - 1, 1));
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

  async function openTodayJournalEntry() {
    const today = todayString();
    selectedMonth.setFromDate(today);
    appCommands.queue({
      id: `open-journal-date-${Date.now()}`,
      type: 'open-journal-date',
      date: today
    });
    await goto('/journal');
  }

  async function openDashboardModal(panel, trigger) {
    activeDashboardPanel = panel;
    dashboardDialogTrigger = trigger || null;

    if (dashboardDialog?.open) return;

    await tick();
    dashboardDialog?.showModal();
  }

  function requestDashboardDialogClose() {
    dashboardDialog?.close();
  }

  function handleDashboardDialogClose() {
    activeDashboardPanel = null;
    const trigger = dashboardDialogTrigger;
    dashboardDialogTrigger = null;
    trigger?.focus?.();
  }

  function handleDashboardDialogCancel(event) {
    event.preventDefault();
    dashboardDialog?.close();
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

  <section class="quote-panel card animate-rise rise-2" aria-labelledby="dashboard-quote-text">
    <div class="quote-shell">
      <blockquote id="dashboard-quote-text">
        <p>{todayQuote.text}</p>
      </blockquote>
      <cite>{todayQuote.author}</cite>
    </div>
  </section>

  <section class="dashboard-main animate-rise rise-3" aria-label="Progress overview">
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
  </section>

  <section class="support-grid animate-rise rise-4" aria-label="Dashboard details">
    <div class="accordion-stack">
      <article class="accordion-card card">
        <button type="button" class="accordion-trigger" onclick={(event) => openDashboardModal('month', event.currentTarget)}>
          <span class="accordion-main">
            <span class="accordion-index" aria-hidden="true">01</span>
            <span class="accordion-copy">
              <strong>{dashboardMonthLabel}</strong>
              <span class="accordion-subtitle">{formatHours(monthInsights.totalHours)} across {monthInsights.activeDays} active days</span>
            </span>
          </span>
          <span class="accordion-side">
            <span class="accordion-meta">{monthShare}% of goal</span>
            <span class="accordion-indicator" aria-hidden="true">+</span>
          </span>
        </button>
      </article>

      <article class="accordion-card card">
        <button type="button" class="accordion-trigger" onclick={(event) => openDashboardModal('milestones', event.currentTarget)}>
          <span class="accordion-main">
            <span class="accordion-index" aria-hidden="true">02</span>
            <span class="accordion-copy">
              <strong>Milestones</strong>
              <span class="accordion-subtitle">{reachedMilestones} of {milestoneCards.length} hour markers reached</span>
            </span>
          </span>
          <span class="accordion-side">
            <span class="accordion-meta">{$progress.current_streak}-day streak</span>
            <span class="accordion-indicator" aria-hidden="true">+</span>
          </span>
        </button>
      </article>

      <article class="today-action-card card">
        <div class="today-action-copy">
          <span class="accordion-index" aria-hidden="true">03</span>
          <div class="today-action-text">
            <strong>Today's journal</strong>
            <p>{todaySummary}</p>
            <span>Write today's entry and log hours in one place.</span>
          </div>
        </div>

        <button type="button" class="btn btn-primary today-action-button" onclick={openTodayJournalEntry}>
          Write today's journal entry
        </button>
      </article>

      {#if $progress.is_completed}
        <article class="accordion-card card">
          <button type="button" class="accordion-trigger" onclick={(event) => openDashboardModal('report', event.currentTarget)}>
            <span class="accordion-main">
              <span class="accordion-index" aria-hidden="true">04</span>
              <span class="accordion-copy">
                <strong>Final report</strong>
                <span class="accordion-subtitle">
                  {#if compilationStatus?.has_report}
                    Report ready to download
                  {:else}
                    Compile the PDF report
                  {/if}
                </span>
              </span>
            </span>
            <span class="accordion-side">
              {#if compilationStatus?.has_report}
                <span class="accordion-meta">Ready</span>
              {:else}
                <span class="accordion-meta">Pending</span>
              {/if}
              <span class="accordion-indicator" aria-hidden="true">+</span>
            </span>
          </button>
        </article>
      {/if}
    </div>
  </section>

  <dialog
    bind:this={dashboardDialog}
    class="dashboard-dialog"
    aria-labelledby="dashboard-dialog-title"
    onclick={(event) => {
      if (event.target === event.currentTarget) requestDashboardDialogClose();
    }}
    onclose={handleDashboardDialogClose}
    oncancel={handleDashboardDialogCancel}
  >
    {#if activeDashboardPanel}
      <div class="dashboard-dialog-shell">
        <header class="dashboard-dialog-head">
          <div class="dashboard-dialog-copy">
            <p class="dashboard-dialog-kicker">
              {#if activeDashboardPanel === 'month'}
                Month overview
              {:else if activeDashboardPanel === 'milestones'}
                Progress markers
              {:else}
                Final report
              {/if}
            </p>
            <h2 id="dashboard-dialog-title">
              {#if activeDashboardPanel === 'month'}
                {dashboardMonthLabel}
              {:else if activeDashboardPanel === 'milestones'}
                Milestones
              {:else}
                Final report
              {/if}
            </h2>
            <p class="dashboard-dialog-summary">
              {#if activeDashboardPanel === 'month'}
                {formatHours(monthInsights.totalHours)} across {monthInsights.activeDays} active days in this month.
              {:else if activeDashboardPanel === 'milestones'}
                {reachedMilestones} of {milestoneCards.length} hour markers are already reached.
              {:else}
                {#if compilationStatus?.has_report}
                  A compiled report is ready to download.
                {:else}
                  Compile the final internship PDF report when you are ready.
                {/if}
              {/if}
            </p>
          </div>

          <button type="button" class="dashboard-dialog-close" onclick={requestDashboardDialogClose}>
            Close
          </button>
        </header>

        <div class="dashboard-dialog-body">
          {#if activeDashboardPanel === 'month'}
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
          {:else if activeDashboardPanel === 'milestones'}
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
          {:else if activeDashboardPanel === 'report'}
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
          {/if}
        </div>
      </div>
    {/if}
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
    width: calc(100% - 0.75rem);
    margin: 0 auto;
    height: 100%;
    min-height: 0;
    padding: clamp(0.9rem, 1.6vw, 1.35rem) clamp(0.85rem, 1.2vw, 1rem) clamp(1.35rem, 3vw, 2rem);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    background: transparent;
    overflow: hidden;
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
    color: var(--red);
  }

  .dashboard-header-copy p {
    margin: 0;
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

  .quote-panel,
  .dashboard-main,
  .support-grid {
    position: relative;
  }

  .quote-panel {
    text-align: center;
    padding-block: 0.55rem;
  }

  .quote-shell {
    display: grid;
    justify-items: center;
    gap: 0.2rem;
    align-content: center;
  }

  .quote-panel blockquote {
    margin: 0;
    max-width: 42rem;
    font-family: var(--font-display);
    font-size: clamp(1.05rem, 1.7vw, 1.45rem);
    line-height: 1.32;
    color: var(--red);
  }

  .quote-panel blockquote p {
    margin: 0;
  }

  .quote-panel cite {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-style: normal;
    color: var(--dark-muted);
  }
  .panel-head h2,
  .milestone-card h3,
  .dashboard-header-copy h1 {
    letter-spacing: -0.02em;
  }

  .panel-head h2 {
    margin: 0;
    font-size: clamp(1.35rem, 2vw, 1.9rem);
  }

  .panel-head p,
  .panel-note {
    font-family: var(--font-ui);
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--dark-soft);
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
    background: rgba(255, 255, 255, 0.7);
  }

  .detail-grid-loading .detail-card {
    display: grid;
    gap: 0.45rem;
  }

  .detail-card dd {
    margin-top: 0.3rem;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2vw, 1.8rem);
    line-height: 1.08;
    color: var(--red);
  }

  .dashboard-main,
  .support-grid {
    display: block;
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

  .panel-note {
    margin-top: 0.85rem;
  }

  .accordion-stack {
    display: grid;
    gap: 0.75rem;
    align-content: start;
  }

  .accordion-card {
    padding: 0;
    overflow: hidden;
    transition: border-color 160ms ease, background-color 160ms ease;
  }

  .accordion-card:hover,
  .accordion-card:focus-within {
    border-color: rgba(190, 53, 25, 0.16);
    background: rgba(255, 250, 244, 0.98);
  }

  .accordion-trigger {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 1rem 1.1rem;
    cursor: pointer;
    transition: background-color 160ms ease;
  }

  .accordion-trigger:focus-visible {
    outline: 2px solid rgba(190, 53, 25, 0.32);
    outline-offset: -2px;
  }

  .accordion-main {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
  }

  .accordion-index {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    border: 1px solid rgba(190, 53, 25, 0.12);
    border-radius: 10px;
    background: rgba(190, 53, 25, 0.05);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--red);
  }

  .accordion-copy {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .accordion-copy strong {
    font-size: 1.08rem;
    color: var(--red);
  }

  .accordion-subtitle,
  .accordion-meta {
    font-family: var(--font-ui);
    font-size: 0.84rem;
    color: var(--dark-soft);
  }

  .accordion-side {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    flex: 0 0 auto;
  }

  .accordion-meta {
    padding: 0.34rem 0.7rem;
    border: 1px solid rgba(190, 53, 25, 0.1);
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.04);
    text-align: right;
    color: var(--dark);
  }

  .accordion-indicator {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid rgba(190, 53, 25, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.85);
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    color: var(--red);
    transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
  }

  .accordion-card:hover .accordion-trigger,
  .accordion-card:focus-within .accordion-trigger {
    background: rgba(190, 53, 25, 0.04);
  }

  .accordion-card:hover .accordion-indicator,
  .accordion-card:focus-within .accordion-indicator {
    background: rgba(190, 53, 25, 0.08);
    border-color: rgba(190, 53, 25, 0.18);
  }

  .today-action-card {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.1rem;
  }

  .today-action-copy {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
  }

  .today-action-text {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  .today-action-text strong {
    font-size: 1.08rem;
    color: var(--red);
  }

  .today-action-text p,
  .today-action-text span {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    line-height: 1.5;
    color: var(--dark-soft);
  }

  .today-action-button {
    flex: 0 0 auto;
    min-height: 2.8rem;
    padding-inline: 1rem;
  }

  .dashboard-dialog {
    width: min(52rem, calc(100vw - 2rem));
    max-width: 52rem;
    max-height: calc(100dvh - 2rem);
    margin: auto;
    inset: 0;
    position: fixed;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    overflow: visible;
  }

  .dashboard-dialog::backdrop {
    background: rgba(44, 24, 13, 0.24);
    backdrop-filter: blur(3px);
  }

  .dashboard-dialog-shell {
    border: 1px solid rgba(190, 53, 25, 0.14);
    border-radius: 18px;
    background: rgba(255, 252, 246, 0.99);
    box-shadow: 0 18px 50px rgba(63, 24, 8, 0.14);
    overflow: hidden;
  }

  .dashboard-dialog-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
    padding: 1.25rem 1.3rem 1rem;
    border-bottom: 1px solid rgba(190, 53, 25, 0.08);
  }

  .dashboard-dialog-copy {
    display: grid;
    gap: 0.32rem;
  }

  .dashboard-dialog-kicker {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--red);
  }

  .dashboard-dialog-head h2 {
    margin: 0;
    font-size: clamp(1.35rem, 2vw, 1.9rem);
    color: var(--red);
  }

  .dashboard-dialog-summary {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--dark-soft);
  }

  .dashboard-dialog-close {
    min-width: 5.2rem;
    min-height: 2.5rem;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(190, 53, 25, 0.16);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.88);
    color: var(--red);
    font-family: var(--font-ui);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }

  .dashboard-dialog-close:focus-visible {
    outline: 2px solid rgba(190, 53, 25, 0.32);
    outline-offset: 2px;
  }

  .dashboard-dialog-body {
    max-height: min(68dvh, 42rem);
    overflow: auto;
    padding: 1.1rem 1.3rem 1.35rem;
  }

  .dashboard-dialog[open] .dashboard-dialog-shell {
    animation: dashboard-dialog-reveal 180ms ease-out;
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

  @keyframes dashboard-dialog-reveal {
    from {
      opacity: 0;
      transform: translateY(6px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
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

    .accordion-trigger {
      align-items: start;
    }

    .accordion-side {
      width: 100%;
      justify-content: space-between;
    }

    .today-action-card {
      flex-direction: column;
      align-items: stretch;
    }

    .today-action-copy {
      align-items: start;
    }

    .headline-metric,
    .headline-skeleton {
      justify-items: start;
    }

    .detail-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 1100px) {
    .quote-panel blockquote {
      max-width: 36rem;
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

    .detail-grid {
      grid-template-columns: 1fr;
    }

    .accordion-trigger {
      flex-direction: column;
      align-items: start;
    }

    .accordion-main,
    .accordion-side {
      width: 100%;
    }

    .dashboard-dialog {
      width: calc(100vw - 1rem);
    }

    .dashboard-dialog-head {
      flex-direction: column;
    }

    .dashboard-dialog-close {
      width: 100%;
    }

    .report-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .report-actions .btn {
      width: 100%;
      justify-content: center;
    }

    .today-action-button {
      width: 100%;
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .trajectory-fill,
    .snapshot-fill,
    .accordion-indicator {
      transition: none;
    }

    .dashboard-dialog[open] .dashboard-dialog-shell {
      animation: none;
    }
  }
</style>
