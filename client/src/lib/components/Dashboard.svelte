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
  let dashboardElement = $state();
  let gsapInstance = $state(null);
  let prefersReducedMotion = $state(false);
  let entranceContext;
  let dataMotionContext;
  let lastDataMotionKey = '';

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

  function formatPercent(value) {
    return `${Math.round(value || 0)}%`;
  }

  function milestonePosition(hours, targetHours) {
    if (!targetHours) return 0;
    return Math.min(100, Math.max(0, (hours / targetHours) * 100));
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

  function playCtaFeedback(event) {
    if (!gsapInstance || prefersReducedMotion) return;
    gsapInstance.to(event.currentTarget, {
      y: -3,
      duration: 0.18,
      ease: 'power2.out'
    });
  }

  function resetCtaFeedback(event) {
    if (!gsapInstance || prefersReducedMotion) return;
    gsapInstance.to(event.currentTarget, {
      y: 0,
      scale: 1,
      duration: 0.18,
      ease: 'power2.out'
    });
  }

  function pressCtaFeedback(event) {
    if (!gsapInstance || prefersReducedMotion) return;
    gsapInstance.to(event.currentTarget, {
      scale: 0.98,
      duration: 0.1,
      ease: 'power1.out'
    });
  }

  function animateDashboardEntrance() {
    if (!gsapInstance || !dashboardElement || prefersReducedMotion) return;

    entranceContext?.revert();
    entranceContext = gsapInstance.context(() => {
      const timeline = gsapInstance.timeline({
        defaults: {
          ease: 'power3.out',
          duration: 0.64
        }
      });

      timeline
        .from('[data-animate="hero"]', { autoAlpha: 0, y: 18 })
        .from('[data-animate="trajectory"]', { autoAlpha: 0, y: 22, duration: 0.72 }, '-=0.38')
        .from('[data-animate="metric"]', { autoAlpha: 0, y: 16, stagger: 0.055, duration: 0.52 }, '-=0.34')
        .from('[data-animate="summary"]', { autoAlpha: 0, y: 18, stagger: 0.08, duration: 0.58 }, '-=0.28')
        .from('[data-animate="cta"]', { autoAlpha: 0, y: 20, duration: 0.62 }, '-=0.22');
    }, dashboardElement);
  }

  function animateDashboardData() {
    if (!gsapInstance || !dashboardElement || prefersReducedMotion || dashboardBusy) return;

    dataMotionContext?.revert();
    dataMotionContext = gsapInstance.context(() => {
      const progressFills = dashboardElement.querySelectorAll('[data-progress-fill]');
      gsapInstance.fromTo(
        progressFills,
        { scaleX: 0 },
        {
          scaleX: 1,
          transformOrigin: 'left center',
          duration: 0.96,
          stagger: 0.08,
          ease: 'power3.out'
        }
      );

      dashboardElement.querySelectorAll('[data-count-value]').forEach((node) => {
        const target = Number(node.getAttribute('data-count-value') || '0');
        const display = node.getAttribute('data-count-display') || String(target);
        const decimals = Number(node.getAttribute('data-count-decimals') || '0');
        const suffix = node.getAttribute('data-count-suffix') || '';

        gsapInstance.fromTo(
          node,
          { textContent: 0 },
          {
            textContent: target,
            duration: 0.86,
            ease: 'power2.out',
            snap: { textContent: decimals > 0 ? 0.1 : 1 },
            onUpdate() {
              const current = Number(node.textContent || 0);
              node.textContent = `${decimals > 0 ? current.toFixed(decimals) : Math.round(current)}${suffix}`;
            },
            onComplete() {
              node.textContent = display;
            }
          }
        );
      });
    }, dashboardElement);
  }

  function clearMotionContexts() {
    entranceContext?.revert();
    dataMotionContext?.revert();
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

  let overallProgress = $derived.by(() =>
    targetHours > 0 ? Math.min(100, Math.max(0, ($progress.total_hours / targetHours) * 100)) : 0
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
      remaining: Math.max(0, hours - $progress.total_hours),
      position: milestonePosition(hours, targetHours)
    }))
  );

  let reachedMilestones = $derived.by(() => milestoneCards.filter((milestone) => milestone.reached).length);
  let nextMilestone = $derived.by(() => milestoneCards.find((milestone) => !milestone.reached) || null);

  let trajectoryLine = $derived.by(() => {
    if ($progress.is_completed) return 'Target complete. The dashboard now supports report work and final record keeping.';
    if (nextMilestone) {
      return `${formatHours(nextMilestone.remaining)} until the ${nextMilestone.hours}h milestone. Projected finish is ${monthInsights.projectedCompletion}.`;
    }
    return `${formatHours($progress.remaining_hours)} remaining toward the target.`;
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

  $effect(() => {
    const dataMotionKey = [
      dashboardBusy,
      eventsLoading,
      $progress.total_hours,
      $progress.remaining_hours,
      $progress.current_streak,
      targetHours,
      monthInsights.totalHours,
      monthInsights.averagePerActiveDay,
      monthShare,
      overallProgress
    ].join('|');

    if (
      !dashboardBusy &&
      !eventsLoading &&
      gsapInstance &&
      dashboardElement &&
      !prefersReducedMotion &&
      dataMotionKey !== lastDataMotionKey
    ) {
      lastDataMotionKey = dataMotionKey;
      tick().then(() => animateDashboardData());
    }
  });

  onMount(() => {
    let destroyed = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = reducedMotion.matches;

    function handleMotionPreference() {
      prefersReducedMotion = reducedMotion.matches;
      if (prefersReducedMotion) {
        clearMotionContexts();
        return;
      }
      tick().then(() => {
        animateDashboardEntrance();
        animateDashboardData();
      });
    }

    reducedMotion.addEventListener?.('change', handleMotionPreference);

    import('gsap').then(({ gsap }) => {
      if (destroyed) return;
      gsapInstance = gsap;
      tick().then(() => {
        animateDashboardEntrance();
        animateDashboardData();
      });
    });

    api.get('/compilation/status').then((status) => (compilationStatus = status)).catch(() => {});
    events.fetchDate(todayString())
      .then((list) => (todayEvents = list || []))
      .finally(() => {
        eventsLoading = false;
      });

    return () => {
      destroyed = true;
      reducedMotion.removeEventListener?.('change', handleMotionPreference);
      clearMotionContexts();
    };
  });
</script>

<div class="dashboard" bind:this={dashboardElement} aria-busy={dashboardBusy || eventsLoading}>
  <header class="dashboard-hero" data-animate="hero">
    <div class="hero-copy">
      <div class="hero-topline">
        <span class="status-block">{greetingLabel}</span>
        <span>{todaySummary}</span>
      </div>
      <h1>Dashboard</h1>
      <p class="hero-summary">
        {dashboardMonthLabel}: <strong>{formatHours($progress.total_hours)}</strong> logged toward
        <strong>{formatHours(targetHours)}</strong>, with <strong>{formatHours($progress.remaining_hours)}</strong> still to close.
      </p>
    </div>

    <div class="hero-tools">
      <div class="month-console" aria-label="Selected month controls">
        <span class="console-label">Month</span>
        <div class="month-controls" role="group" aria-label="Selected month controls">
          <button type="button" class="block-button" onclick={() => shiftSelectedMonth(-1)}>
            Prev
          </button>
          <label class="month-picker">
            <span class="sr-only">Select dashboard month</span>
            <input
              class="month-input"
              type="month"
              bind:value={$selectedMonth}
              aria-label="Select dashboard month"
            />
          </label>
          <button type="button" class="block-button" onclick={() => shiftSelectedMonth(1)}>
            Next
          </button>
        </div>
      </div>

      <figure class="quote-strip" aria-labelledby="dashboard-quote-text">
        <blockquote id="dashboard-quote-text">
          <p>{todayQuote.text}</p>
        </blockquote>
        <figcaption>{todayQuote.author}</figcaption>
      </figure>
    </div>
  </header>

  <section class="trajectory-board" data-animate="trajectory" aria-labelledby="trajectory-title">
    <div class="trajectory-copy">
      <div class="section-marker">Trajectory</div>
      <h2 id="trajectory-title">Milestone path</h2>
      <p>{trajectoryLine}</p>
    </div>

    {#if dashboardBusy}
      <div class="trajectory-loading" aria-hidden="true">
        <span class="skeleton-line medium"></span>
        <span class="skeleton-block track-skeleton"></span>
        <span class="skeleton-line long"></span>
      </div>
    {:else}
      <div class="hours-lockup" aria-label={`${formatHours($progress.total_hours)} logged`}>
        <span
          class="hours-value"
          data-count-value={$progress.total_hours || 0}
          data-count-display={formatHours($progress.total_hours)}
          data-count-decimals={Number.isInteger($progress.total_hours) ? 0 : 1}
        >
          {formatHours($progress.total_hours)}
        </span>
        <span class="hours-caption">logged</span>
      </div>

      <div class="trajectory-progress">
        <div class="progress-head">
          <span>Internship target</span>
          <strong>{formatPercent(overallProgress)}</strong>
        </div>
        <div
          class="brutal-track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={targetHours}
          aria-valuenow={$progress.total_hours}
          aria-valuetext={`${formatHours($progress.total_hours)} of ${formatHours(targetHours)} logged`}
        >
          <span
            class="brutal-fill"
            data-progress-fill
            style={`width: ${overallProgress}%`}
          ></span>
          {#each milestoneCards as milestone}
            <span
              class:reached={milestone.reached}
              class="milestone-pin"
              style={`left: ${milestone.position}%`}
              aria-hidden="true"
            ></span>
          {/each}
        </div>
        <div class="trajectory-scale">
          <span>0h</span>
          <span>{nextMilestone ? `${nextMilestone.hours}h next` : 'All markers reached'}</span>
          <span>{formatHours(targetHours)}</span>
        </div>
      </div>

      <dl class="trajectory-stats">
        <div>
          <dt>Current status</dt>
          <dd>{greetingLabel}</dd>
          <p>{formatPercent(overallProgress)} of the internship target is logged.</p>
        </div>
        <div>
          <dt>Projected finish</dt>
          <dd>{monthInsights.projectedCompletion}</dd>
          <p>{monthInsights.daysNeeded} working day{monthInsights.daysNeeded === 1 ? '' : 's'} needed at the current average.</p>
        </div>
      </dl>
    {/if}
  </section>

  <section class="metric-grid" aria-label="Key dashboard metrics">
    <article class="metric-card metric-card-primary" data-animate="metric">
      <div class="metric-label">Overall month progress</div>
      <strong
        data-count-value={monthInsights.totalHours || 0}
        data-count-display={formatHours(monthInsights.totalHours)}
        data-count-decimals={Number.isInteger(monthInsights.totalHours) ? 0 : 1}
      >
        {formatHours(monthInsights.totalHours)}
      </strong>
      <p>This selected month contributes {monthShare}% of the full internship target.</p>
      <div class="small-track" aria-hidden="true">
        <span data-progress-fill style={`width: ${monthShare}%`}></span>
      </div>
    </article>

    <article class="metric-card" data-animate="metric">
      <div class="metric-label">Average active day</div>
      <strong
        data-count-value={monthInsights.averagePerActiveDay || 0}
        data-count-display={formatHours(monthInsights.averagePerActiveDay)}
        data-count-decimals={Number.isInteger(monthInsights.averagePerActiveDay) ? 0 : 1}
      >
        {formatHours(monthInsights.averagePerActiveDay)}
      </strong>
      <p>{cadenceLabel}. Only days with journal activity are counted here.</p>
    </article>

    <article class="metric-card" data-animate="metric">
      <div class="metric-label">Current streak</div>
      <strong
        data-count-value={$progress.current_streak || 0}
        data-count-display={`${$progress.current_streak}d`}
        data-count-suffix="d"
      >
        {$progress.current_streak}d
      </strong>
      <p>Consecutive active days in the running internship record.</p>
    </article>

    <article class="metric-card metric-card-red" data-animate="metric">
      <div class="metric-label">Next milestone</div>
      <strong>{nextMilestone ? `${nextMilestone.hours}h` : 'Done'}</strong>
      <p>{nextMilestone ? `${formatHours(nextMilestone.remaining)} left before this marker turns complete.` : 'Every milestone marker is complete.'}</p>
    </article>
  </section>

  <section class="summary-grid" aria-label="Dashboard summaries">
    <article class="summary-panel" data-animate="summary" aria-labelledby="monthly-summary-title">
      <header class="summary-head">
        <div>
          <div class="section-marker">Monthly summary</div>
          <h2 id="monthly-summary-title">{dashboardMonthLabel}</h2>
        </div>
        <button type="button" class="text-button" onclick={(event) => openDashboardModal('month', event.currentTarget)}>
          Details
        </button>
      </header>

      <dl class="summary-list">
        <div>
          <dt>Hours this month</dt>
          <dd>{formatHours(monthInsights.totalHours)}</dd>
        </div>
        <div>
          <dt>Active days</dt>
          <dd>{monthInsights.activeDays}</dd>
        </div>
        <div>
          <dt>Finished days</dt>
          <dd>{monthInsights.finishedDays}</dd>
        </div>
        <div>
          <dt>Completion rate</dt>
          <dd>{completionRate}%</dd>
        </div>
      </dl>
    </article>

    <article class="summary-panel milestones-panel" data-animate="summary" aria-labelledby="milestones-summary-title">
      <header class="summary-head">
        <div>
          <div class="section-marker">Milestones summary</div>
          <h2 id="milestones-summary-title">{reachedMilestones}/{milestoneCards.length} reached</h2>
        </div>
        <button type="button" class="text-button" onclick={(event) => openDashboardModal('milestones', event.currentTarget)}>
          Details
        </button>
      </header>

      <div class="milestone-strip" aria-label="Hour milestones">
        {#each milestoneCards as milestone}
          <div class:reached={milestone.reached} class="milestone-block">
            <span>{milestone.hours}h</span>
            <strong>{milestone.reached ? 'Reached' : `${formatHours(milestone.remaining)} left`}</strong>
          </div>
        {/each}
      </div>
    </article>
  </section>

  <section class="journal-cta" data-animate="cta" aria-labelledby="journal-cta-title">
    <div>
      <div class="section-marker">Next action</div>
      <h2 id="journal-cta-title">Write today's journal entry</h2>
      <p>{todaySummary}. Capture the hours, decisions, and loose ends while the day is still easy to reconstruct.</p>
    </div>

    <button
      type="button"
      class="cta-button"
      onclick={openTodayJournalEntry}
      onmouseenter={playCtaFeedback}
      onmouseleave={resetCtaFeedback}
      onmousedown={pressCtaFeedback}
      onmouseup={playCtaFeedback}
    >
      Write entry
    </button>
  </section>

  {#if $progress.is_completed}
    <section class="report-panel" data-animate="summary" aria-labelledby="report-panel-title">
      <div>
        <div class="section-marker">Final report</div>
        <h2 id="report-panel-title">{compilationStatus?.has_report ? 'Report ready' : 'Compile the PDF report'}</h2>
        <p>
          {#if compilationStatus?.has_report}
            The internship report has been compiled and is ready to download.
          {:else}
            The hour target is complete, so the final report action is now available.
          {/if}
        </p>
      </div>
      <button type="button" class="text-button" onclick={(event) => openDashboardModal('report', event.currentTarget)}>
        Open
      </button>
    </section>
  {/if}

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
              <div class="summary-list" aria-hidden="true">
                {#each Array.from({ length: 4 }) as _}
                  <div>
                    <span class="skeleton-line short"></span>
                    <span class="skeleton-line medium"></span>
                  </div>
                {/each}
              </div>
            {:else}
              <dl class="summary-list dialog-summary-list">
                <div>
                  <dt>Hours logged</dt>
                  <dd>{formatHours(monthInsights.totalHours)}</dd>
                </div>
                <div>
                  <dt>Days active</dt>
                  <dd>{monthInsights.activeDays}</dd>
                </div>
                <div>
                  <dt>Days finished</dt>
                  <dd>{monthInsights.finishedDays}</dd>
                </div>
                <div>
                  <dt>Current cadence</dt>
                  <dd>{cadenceLabel}</dd>
                </div>
              </dl>

              <div class="dialog-progress">
                <div class="progress-head">
                  <span>This month contributes {monthShare}% of the internship goal.</span>
                  <strong>{formatHours(monthInsights.totalHours)}</strong>
                </div>
                <div class="small-track" aria-hidden="true">
                  <span style={`width: ${monthShare}%`}></span>
                </div>
                <p>
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
                    {milestone.reached ? 'Reached' : `${formatHours(milestone.remaining)} left`}
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
              <p>
                {#if compilationStatus?.has_report}
                  A compiled report is ready to download.
                {:else}
                  The report has not been compiled yet.
                {/if}
              </p>

              {#if compilationStatus?.has_report}
                <button class="block-button block-button-primary" onclick={handleDownload} disabled={downloading}>
                  {downloading ? 'Downloading...' : 'Download report'}
                </button>
              {:else}
                <button class="block-button block-button-primary" onclick={handleCompile} disabled={compiling}>
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
        <button class="block-button block-button-primary" onclick={closeCelebration}>Keep going</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    --dash-canvas: #fff0cf;
    --dash-paper: #fff8e8;
    --dash-paper-strong: #fffbef;
    --dash-red: var(--red);
    --dash-red-dark: #8f2412;
    --dash-ink: #24150e;
    --dash-muted: #725f4c;
    --dash-border: #24150e;
    --dash-shadow: 7px 7px 0 var(--dash-ink);
    --dash-red-shadow: 7px 7px 0 var(--dash-red);
    width: 100%;
    min-height: 100%;
    padding: 1.25rem;
    color: var(--dash-ink);
    background:
      repeating-linear-gradient(
        0deg,
        rgba(36, 21, 14, 0.045) 0,
        rgba(36, 21, 14, 0.045) 1px,
        transparent 1px,
        transparent 34px
      ),
      var(--dash-canvas);
    overflow: visible;
  }

  .dashboard,
  .dashboard * {
    letter-spacing: 0;
  }

  .dashboard h1,
  .dashboard h2,
  .dashboard h3,
  .dashboard p,
  .dashboard dl,
  .dashboard figure {
    margin: 0;
  }

  .dashboard h1,
  .dashboard h2,
  .dashboard h3 {
    color: var(--dash-ink);
  }

  .dashboard-hero,
  .trajectory-board,
  .metric-card,
  .summary-panel,
  .journal-cta,
  .report-panel {
    border: 2px solid var(--dash-border);
    border-radius: 6px;
    background: var(--dash-paper);
    box-shadow: var(--dash-shadow);
  }

  .dashboard-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(22rem, 0.75fr);
    gap: 1rem;
    align-items: stretch;
    padding: 1.2rem;
  }

  .hero-copy {
    display: grid;
    align-content: space-between;
    gap: 1.2rem;
    min-height: 18rem;
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    padding: 1rem;
    background:
      linear-gradient(90deg, rgba(190, 53, 25, 0.09) 0 0.6rem, transparent 0.6rem),
      var(--dash-paper-strong);
  }

  .hero-topline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--dash-muted);
  }

  .status-block,
  .section-marker,
  .console-label,
  .metric-label,
  .dashboard-dialog-kicker {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    min-height: 1.9rem;
    padding: 0.25rem 0.55rem;
    border: 2px solid var(--dash-border);
    border-radius: 3px;
    background: var(--dash-red);
    color: var(--dash-paper-strong);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 800;
    line-height: 1;
  }

  .dashboard h1 {
    font-size: 4.5rem;
    line-height: 0.92;
    max-width: 12ch;
  }

  .hero-summary {
    max-width: 52rem;
    font-family: var(--font-ui);
    font-size: 1.08rem;
    line-height: 1.45;
    color: var(--dash-ink);
  }

  .hero-summary strong {
    color: var(--dash-red);
    font-weight: 900;
  }

  .hero-tools {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1rem;
  }

  .month-console,
  .quote-strip {
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper-strong);
  }

  .month-console {
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem;
  }

  .month-controls {
    display: grid;
    grid-template-columns: auto minmax(10rem, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
  }

  .month-picker {
    min-width: 0;
  }

  .month-input {
    width: 100%;
    min-height: 2.65rem;
    border: 2px solid var(--dash-border);
    border-radius: 3px;
    background: #fffef8;
    color: var(--dash-ink);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 700;
    padding: 0.5rem 0.65rem;
  }

  .month-input:focus {
    outline: 3px solid rgba(190, 53, 25, 0.28);
    outline-offset: 2px;
  }

  .quote-strip {
    display: grid;
    align-content: end;
    gap: 0.75rem;
    padding: 1rem;
    background:
      linear-gradient(180deg, transparent 0 58%, rgba(190, 53, 25, 0.1) 58% 100%),
      var(--dash-paper-strong);
  }

  .quote-strip blockquote {
    font-family: var(--font-display);
    font-size: 1.55rem;
    line-height: 1.16;
    color: var(--dash-red);
  }

  .quote-strip figcaption {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--dash-ink);
  }

  .trajectory-board {
    display: grid;
    grid-template-columns: minmax(16rem, 0.75fr) minmax(12rem, 0.45fr) minmax(20rem, 1fr);
    gap: 1rem;
    align-items: stretch;
    margin-top: 1.35rem;
    padding: 1.1rem;
    background: var(--dash-paper-strong);
    box-shadow: var(--dash-red-shadow);
  }

  .trajectory-copy,
  .hours-lockup,
  .trajectory-progress,
  .trajectory-stats > div,
  .trajectory-loading {
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper);
  }

  .trajectory-copy {
    display: grid;
    align-content: space-between;
    gap: 1.1rem;
    padding: 1rem;
  }

  .trajectory-copy h2,
  .summary-head h2,
  .journal-cta h2,
  .report-panel h2,
  .dashboard-dialog-head h2 {
    font-size: 2.15rem;
    line-height: 1.02;
  }

  .trajectory-copy p,
  .metric-card p,
  .journal-cta p,
  .report-panel p,
  .dashboard-dialog-summary,
  .dialog-progress p,
  .milestone-note,
  .report-actions p {
    font-family: var(--font-ui);
    color: var(--dash-muted);
    line-height: 1.45;
  }

  .hours-lockup {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    padding: 1rem;
    background: var(--dash-red);
    color: var(--dash-paper-strong);
  }

  .hours-value {
    font-family: var(--font-display);
    font-size: 4.4rem;
    line-height: 0.9;
  }

  .hours-caption {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 900;
  }

  .trajectory-progress {
    align-self: stretch;
    display: grid;
    align-content: center;
    gap: 0.75rem;
    padding: 1rem;
  }

  .progress-head,
  .trajectory-scale {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 800;
  }

  .progress-head strong {
    color: var(--dash-red);
  }

  .brutal-track,
  .small-track {
    position: relative;
    height: 1.25rem;
    border: 2px solid var(--dash-border);
    border-radius: 3px;
    background:
      repeating-linear-gradient(
        90deg,
        rgba(36, 21, 14, 0.08) 0,
        rgba(36, 21, 14, 0.08) 1px,
        transparent 1px,
        transparent 12px
      ),
      #fffef8;
    overflow: hidden;
  }

  .brutal-fill,
  .small-track span {
    display: block;
    height: 100%;
    transform-origin: left center;
    background: var(--dash-red);
  }

  .milestone-pin {
    position: absolute;
    top: 50%;
    width: 0.7rem;
    height: 1.95rem;
    border: 2px solid var(--dash-border);
    border-radius: 2px;
    background: var(--dash-paper-strong);
    transform: translate(-50%, -50%);
  }

  .milestone-pin.reached {
    background: var(--dash-ink);
  }

  .trajectory-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media (min-width: 1181px) {
    .trajectory-copy {
      grid-row: 1 / span 2;
    }

    .trajectory-stats {
      grid-column: 2 / -1;
    }
  }

  .trajectory-stats > div {
    display: grid;
    align-content: space-between;
    gap: 0.55rem;
    padding: 0.85rem;
  }

  .trajectory-stats dt,
  .summary-list dt {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 900;
    color: var(--dash-muted);
  }

  .trajectory-stats dd,
  .summary-list dd {
    font-family: var(--font-display);
    font-size: 1.85rem;
    line-height: 1;
    color: var(--dash-red);
  }

  .trajectory-stats p {
    font-family: var(--font-ui);
    font-size: 0.86rem;
    line-height: 1.35;
    color: var(--dash-muted);
  }

  .trajectory-loading {
    grid-column: span 2;
    display: grid;
    align-content: center;
    gap: 0.85rem;
    padding: 1rem;
  }

  .track-skeleton {
    height: 1.25rem;
    border-radius: 3px;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1.4fr) repeat(3, minmax(13rem, 1fr));
    gap: 1rem;
    margin-top: 1.35rem;
  }

  .metric-card {
    display: grid;
    gap: 0.8rem;
    align-content: start;
    min-height: 12.5rem;
    padding: 1rem;
  }

  .metric-card-primary {
    min-height: 14rem;
  }

  .metric-card strong {
    font-family: var(--font-display);
    font-size: 2.75rem;
    line-height: 0.95;
    color: var(--dash-red);
  }

  .metric-card-primary strong {
    font-size: 3.8rem;
  }

  .metric-card-red {
    background: var(--dash-red);
    color: var(--dash-paper-strong);
  }

  .metric-card-red .metric-label {
    background: var(--dash-paper-strong);
    color: var(--dash-red);
  }

  .metric-card-red strong,
  .metric-card-red p {
    color: var(--dash-paper-strong);
  }

  .small-track {
    height: 0.95rem;
    margin-top: auto;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    gap: 1rem;
    margin-top: 1.35rem;
  }

  .summary-panel {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  .summary-head,
  .report-panel {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .summary-head > div,
  .report-panel > div,
  .journal-cta > div {
    display: grid;
    gap: 0.65rem;
  }

  .summary-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .summary-list > div {
    min-width: 0;
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper-strong);
    padding: 0.8rem;
  }

  .summary-list dd {
    margin-top: 0.4rem;
    font-family: var(--font-ui);
    font-size: 1.55rem;
    font-weight: 900;
    line-height: 1.08;
  }

  .milestone-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .milestone-block {
    display: grid;
    gap: 0.35rem;
    min-height: 7.8rem;
    align-content: space-between;
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper-strong);
    padding: 0.8rem;
  }

  .milestone-block.reached {
    background: var(--dash-ink);
    color: var(--dash-paper-strong);
  }

  .milestone-block span,
  .milestone-block strong {
    font-family: var(--font-ui);
    font-weight: 900;
  }

  .milestone-block strong {
    font-size: 0.9rem;
  }

  .journal-cta {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    margin-top: 1.35rem;
    padding: 1.15rem;
    background: var(--dash-red);
    color: var(--dash-paper-strong);
    box-shadow: var(--dash-shadow);
  }

  .journal-cta h2,
  .journal-cta p {
    color: var(--dash-paper-strong);
  }

  .journal-cta .section-marker {
    background: var(--dash-paper-strong);
    color: var(--dash-red);
  }

  .cta-button,
  .block-button,
  .text-button,
  .dashboard-dialog-close {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 2.65rem;
    border: 2px solid var(--dash-border);
    border-radius: 3px;
    background: var(--dash-paper-strong);
    color: var(--dash-ink);
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 900;
    line-height: 1;
    padding: 0.65rem 0.9rem;
    box-shadow: 4px 4px 0 var(--dash-ink);
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }

  .cta-button {
    min-width: 13rem;
    min-height: 4rem;
    background: var(--dash-paper-strong);
    color: var(--dash-red);
    font-size: 1.15rem;
  }

  .block-button:hover,
  .text-button:hover,
  .dashboard-dialog-close:hover,
  .cta-button:hover {
    background: var(--dash-ink);
    color: var(--dash-paper-strong);
  }

  .block-button:active,
  .text-button:active,
  .dashboard-dialog-close:active,
  .cta-button:active {
    box-shadow: 2px 2px 0 var(--dash-ink);
  }

  .block-button:focus-visible,
  .text-button:focus-visible,
  .dashboard-dialog-close:focus-visible,
  .cta-button:focus-visible {
    outline: 3px solid rgba(190, 53, 25, 0.32);
    outline-offset: 3px;
  }

  .block-button-primary {
    background: var(--dash-red);
    color: var(--dash-paper-strong);
  }

  .block-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .report-panel {
    margin-top: 1.35rem;
    padding: 1rem;
  }

  .dashboard-dialog {
    width: min(54rem, calc(100vw - 2rem));
    max-width: 54rem;
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
    background: rgba(36, 21, 14, 0.48);
  }

  .dashboard-dialog-shell {
    border: 2px solid var(--dash-border);
    border-radius: 6px;
    background: var(--dash-paper);
    box-shadow: 9px 9px 0 var(--dash-ink);
    overflow: hidden;
  }

  .dashboard-dialog-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    padding: 1rem;
    border-bottom: 2px solid var(--dash-border);
    background: var(--dash-paper-strong);
  }

  .dashboard-dialog-copy {
    display: grid;
    gap: 0.55rem;
  }

  .dashboard-dialog-body {
    max-height: min(68dvh, 42rem);
    overflow: auto;
    padding: 1rem;
  }

  .dashboard-dialog[open] .dashboard-dialog-shell {
    animation: dashboard-dialog-reveal 180ms ease-out;
  }

  .dialog-summary-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .dialog-progress {
    display: grid;
    gap: 0.75rem;
    margin-top: 1rem;
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper-strong);
    padding: 1rem;
  }

  .milestone-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }

  .milestone-card {
    border: 2px solid var(--dash-border);
    border-radius: 4px;
    background: var(--dash-paper-strong);
    padding: 0.9rem;
  }

  .milestone-card.reached {
    background: var(--dash-ink);
    color: var(--dash-paper-strong);
  }

  .milestone-card h3 {
    font-size: 1.3rem;
    color: inherit;
  }

  .milestone-status {
    margin-top: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.92rem;
    font-weight: 900;
    color: var(--dash-red);
  }

  .milestone-card.reached .milestone-status,
  .milestone-card.reached .milestone-note {
    color: var(--dash-paper-strong);
  }

  .milestone-note {
    margin-top: 0.4rem;
  }

  .report-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.8rem;
    align-items: center;
  }

  .celebration-overlay {
    z-index: 25;
  }

  .celebration-modal {
    max-width: 460px;
    border: 2px solid var(--dash-border);
    border-radius: 6px;
    background: var(--dash-paper);
    box-shadow: var(--dash-shadow);
    text-align: center;
  }

  .celebration-modal h2 {
    color: var(--dash-ink);
    font-size: 2rem;
  }

  .celebration-modal p {
    margin: 0.75rem 0 1rem;
    font-family: var(--font-ui);
    color: var(--dash-muted);
  }

  .skeleton-line,
  .skeleton-block {
    border-radius: 3px;
  }

  @keyframes dashboard-dialog-reveal {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 1180px) {
    .dashboard h1 {
      font-size: 3.55rem;
    }

    .dashboard-hero,
    .trajectory-board,
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .hero-copy {
      min-height: 14rem;
    }

    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .trajectory-board {
      gap: 0.85rem;
    }
  }

  @media (max-width: 760px) {
    .dashboard {
      padding: 0.8rem;
    }

    .dashboard-hero,
    .trajectory-board,
    .metric-card,
    .summary-panel,
    .journal-cta,
    .report-panel {
      box-shadow: 5px 5px 0 var(--dash-ink);
    }

    .dashboard h1 {
      font-size: 2.65rem;
    }

    .hero-copy {
      min-height: 12rem;
    }

    .month-controls,
    .metric-grid,
    .summary-list,
    .milestone-strip,
    .dialog-summary-list,
    .trajectory-stats,
    .journal-cta {
      grid-template-columns: 1fr;
    }

    .month-controls {
      align-items: stretch;
    }

    .quote-strip blockquote {
      font-size: 1.25rem;
    }

    .hours-value {
      font-size: 3.3rem;
    }

    .metric-card-primary strong,
    .metric-card strong {
      font-size: 2.45rem;
    }

    .summary-head,
    .report-panel,
    .dashboard-dialog-head,
    .report-actions {
      flex-direction: column;
    }

    .text-button,
    .dashboard-dialog-close,
    .cta-button {
      width: 100%;
    }
  }

  @media (max-width: 460px) {
    .dashboard {
      padding: 0.65rem;
    }

    .dashboard-hero,
    .trajectory-board {
      padding: 0.75rem;
    }

    .dashboard h1 {
      font-size: 2.2rem;
    }

    .trajectory-copy h2,
    .summary-head h2,
    .journal-cta h2,
    .report-panel h2,
    .dashboard-dialog-head h2 {
      font-size: 1.7rem;
    }

    .dashboard-dialog {
      width: calc(100vw - 1rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dashboard-dialog[open] .dashboard-dialog-shell {
      animation: none;
    }
  }
</style>
