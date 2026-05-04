<script>
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import {
    CalendarBlank,
    CheckCircle,
    FlagBanner,
    Lightning,
    PencilSimpleLine,
    TrendUp,
    Trophy,
    Target
  } from 'phosphor-svelte';
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
    if (pct >= 100) return 'Complete';
    if (pct >= 75) return 'Closing';
    if (pct >= 50) return 'Halfway';
    if (pct >= 25) return 'On track';
    return 'Starting';
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
    if ($progress.is_completed) return 'Target complete.';
    if (nextMilestone) {
      return `${formatHours(nextMilestone.remaining)} until ${nextMilestone.hours}h. Finish: ${monthInsights.projectedCompletion}.`;
    }
    return `${formatHours($progress.remaining_hours)} remaining.`;
  });

  let todaySummary = $derived.by(() => {
    if (eventsLoading) return 'Loading';
    if (todayEvents.length === 0) return 'No events';
    return `${todayEvents.length} event${todayEvents.length === 1 ? '' : 's'} today`;
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
        <span class="status-block">
          <TrendUp size={14} weight="bold" />
          {greetingLabel}
        </span>
        <span class="hero-topline-meta">
          <CalendarBlank size={14} weight="regular" />
          {todaySummary}
        </span>
      </div>
      <h1>Overview</h1>
      <p class="hero-summary">
        <strong>{formatHours($progress.total_hours)}</strong> of <strong>{formatHours(targetHours)}</strong> logged. <strong>{formatHours($progress.remaining_hours)}</strong> left.
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
      <div class="section-marker section-marker-icon">
        <Target size={14} weight="bold" />
        Trajectory
      </div>
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
          <p>{formatPercent(overallProgress)} logged.</p>
        </div>
        <div>
          <dt>Projected finish</dt>
          <dd>{monthInsights.projectedCompletion}</dd>
          <p>{monthInsights.daysNeeded} workday{monthInsights.daysNeeded === 1 ? '' : 's'} at this pace.</p>
        </div>
      </dl>
    {/if}
  </section>

  <section class="metric-grid" aria-label="Key dashboard metrics">
    <article class="metric-card metric-card-primary" data-animate="metric">
      <div class="metric-label metric-label-row"><CalendarBlank size={14} weight="bold" /> Month</div>
      <strong
        data-count-value={monthInsights.totalHours || 0}
        data-count-display={formatHours(monthInsights.totalHours)}
        data-count-decimals={Number.isInteger(monthInsights.totalHours) ? 0 : 1}
      >
        {formatHours(monthInsights.totalHours)}
      </strong>
      <p>{monthShare}% of target</p>
      <div class="small-track" aria-hidden="true">
        <span data-progress-fill style={`width: ${monthShare}%`}></span>
      </div>
    </article>

    <article class="metric-card" data-animate="metric">
      <div class="metric-label metric-label-row"><Lightning size={14} weight="bold" /> Pace</div>
      <strong
        data-count-value={monthInsights.averagePerActiveDay || 0}
        data-count-display={formatHours(monthInsights.averagePerActiveDay)}
        data-count-decimals={Number.isInteger(monthInsights.averagePerActiveDay) ? 0 : 1}
      >
        {formatHours(monthInsights.averagePerActiveDay)}
      </strong>
      <p>{cadenceLabel}</p>
    </article>

    <article class="metric-card" data-animate="metric">
      <div class="metric-label metric-label-row"><Trophy size={14} weight="bold" /> Streak</div>
      <strong
        data-count-value={$progress.current_streak || 0}
        data-count-display={`${$progress.current_streak}d`}
        data-count-suffix="d"
      >
        {$progress.current_streak}d
      </strong>
      <p>Consecutive days</p>
    </article>

    <article class="metric-card metric-card-red" data-animate="metric">
      <div class="metric-label metric-label-row"><FlagBanner size={14} weight="bold" /> Next</div>
      <strong>{nextMilestone ? `${nextMilestone.hours}h` : 'Done'}</strong>
      <p>{nextMilestone ? `${formatHours(nextMilestone.remaining)} left` : 'Complete'}</p>
    </article>
  </section>

  <section class="summary-grid" aria-label="Dashboard summaries">
    <article class="summary-panel" data-animate="summary" aria-labelledby="monthly-summary-title">
      <header class="summary-head">
        <div>
          <div class="section-marker section-marker-icon">
            <CalendarBlank size={14} weight="bold" />
            Month
          </div>
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
          <div class="section-marker section-marker-icon">
            <CheckCircle size={14} weight="bold" />
            Milestones
          </div>
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
      <div class="section-marker section-marker-icon">
        <PencilSimpleLine size={14} weight="bold" />
        Action
      </div>
      <h2 id="journal-cta-title">Log today</h2>
      <p>{todaySummary}. Capture it while it is fresh.</p>
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
    --dash-border: rgba(36, 21, 14, 0.18);
    --dash-divider: rgba(36, 21, 14, 0.12);
    --dash-shadow: 0 1px 0 rgba(36, 21, 14, 0.08), 0 18px 34px rgba(36, 21, 14, 0.05);
    --dash-red-shadow: 0 1px 0 rgba(190, 53, 25, 0.12), 0 18px 34px rgba(190, 53, 25, 0.08);
    width: 100%;
    min-height: 100%;
    padding: 1.35rem;
    color: var(--dash-ink);
    background: var(--dash-canvas);
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

  .trajectory-board,
  .metric-grid,
  .summary-panel,
  .report-panel {
    border: 1px solid var(--dash-border);
    border-radius: 10px;
    background: var(--dash-paper);
    box-shadow: var(--dash-shadow);
  }

  .dashboard-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(22rem, 0.75fr);
    gap: 1rem;
    align-items: start;
    padding: 0 0 1.15rem;
    border-bottom: 1px solid var(--dash-divider);
  }

  .hero-copy {
    display: grid;
    align-content: start;
    gap: 0.95rem;
    min-height: 0;
    padding: 0.15rem 0;
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

  .hero-topline-meta,
  .metric-label-row,
  .section-marker-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .status-block,
  .section-marker,
  .console-label,
  .metric-label,
  .dashboard-dialog-kicker {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.35rem;
    min-height: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--dash-muted);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-block {
    color: var(--dash-red);
  }

  .dashboard h1 {
    font-size: clamp(3rem, 5vw, 3.85rem);
    line-height: 0.96;
    max-width: 12ch;
  }

  .hero-summary {
    max-width: 40rem;
    font-family: var(--font-ui);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--dash-ink);
  }

  .hero-summary strong {
    color: var(--dash-red);
    font-weight: 900;
  }

  .hero-tools {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 0.85rem;
  }

  .month-console,
  .quote-strip {
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .month-console {
    display: grid;
    gap: 0.55rem;
    padding: 0;
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
    border: 1px solid var(--dash-border);
    border-radius: 8px;
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
    align-content: start;
    gap: 0.45rem;
    padding: 0.85rem 0 0;
    border-top: 1px solid var(--dash-divider);
  }

  .quote-strip blockquote {
    font-family: var(--font-display);
    font-size: 1.25rem;
    line-height: 1.18;
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
    margin-top: 0.2rem;
    padding: 1.2rem;
    background: var(--dash-paper-strong);
    box-shadow: var(--dash-shadow);
  }

  .trajectory-copy,
  .hours-lockup,
  .trajectory-progress,
  .trajectory-stats > div,
  .trajectory-loading {
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .trajectory-copy {
    display: grid;
    align-content: space-between;
    gap: 1.1rem;
    padding: 0;
  }

  .trajectory-copy h2,
  .summary-head h2,
  .journal-cta h2,
  .report-panel h2,
  .dashboard-dialog-head h2 {
    font-size: 1.85rem;
    line-height: 1.04;
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
    padding: 1.15rem 1rem;
    border-radius: 10px;
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
    padding: 0.1rem 0;
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
    border: 1px solid var(--dash-border);
    border-radius: 999px;
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
    border: 1px solid var(--dash-border);
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
    padding: 0.85rem 0 0;
    border-top: 1px solid var(--dash-divider);
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
    padding: 1.05rem 1.2rem;
  }

  .metric-card {
    display: grid;
    gap: 0.65rem;
    align-content: start;
    min-height: 0;
    padding: 0.1rem 0;
    background: transparent;
    box-shadow: none;
  }

  .metric-card-primary {
    min-height: 0;
  }

  .metric-card:not(:first-child) {
    border-left: 1px solid var(--dash-divider);
    padding-left: 1rem;
  }

  .metric-card strong {
    font-family: var(--font-display);
    font-size: 2.5rem;
    line-height: 0.95;
    color: var(--dash-red);
  }

  .metric-card-primary strong {
    font-size: 3.3rem;
  }

  .metric-card-red {
    border-left-color: var(--dash-red);
    background: rgba(190, 53, 25, 0.06);
  }

  .metric-card-red .metric-label {
    color: var(--dash-red);
  }

  .metric-card-red strong,
  .metric-card-red p {
    color: var(--dash-ink);
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
    padding: 1.05rem 1.15rem;
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
    gap: 0.9rem;
  }

  .summary-list > div {
    min-width: 0;
    padding: 0.1rem 0;
  }

  .summary-list > div:not(:first-child) {
    border-left: 1px solid var(--dash-divider);
    padding-left: 0.9rem;
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
    gap: 0.9rem;
  }

  .milestone-block {
    display: grid;
    gap: 0.5rem;
    min-height: 0;
    align-content: start;
    padding: 0.75rem 0 0;
    border-top: 2px solid var(--dash-divider);
    background: transparent;
  }

  .milestone-block.reached {
    color: var(--dash-ink);
    border-top-color: var(--dash-red);
  }

  .milestone-block span,
  .milestone-block strong {
    font-family: var(--font-ui);
    font-weight: 900;
  }

  .milestone-block strong {
    font-size: 0.9rem;
    color: var(--dash-red);
  }

  .milestone-block span {
    color: var(--dash-muted);
  }

  .milestone-block.reached strong {
    color: var(--dash-ink);
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
    border: none;
    border-radius: 10px;
    box-shadow: 0 16px 28px rgba(190, 53, 25, 0.16);
  }

  .journal-cta h2,
  .journal-cta p {
    color: var(--dash-paper-strong);
  }

  .journal-cta .section-marker {
    color: rgba(255, 251, 239, 0.76);
  }

  .cta-button,
  .block-button,
  .text-button,
  .dashboard-dialog-close {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 2.65rem;
    border: 1px solid var(--dash-border);
    border-radius: 8px;
    background: var(--dash-paper-strong);
    color: var(--dash-ink);
    font-family: var(--font-ui);
    font-size: 0.9rem;
    font-weight: 900;
    line-height: 1;
    padding: 0.65rem 0.9rem;
    box-shadow: none;
    transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }

  .cta-button {
    min-width: 11.5rem;
    min-height: 3.4rem;
    background: var(--dash-paper-strong);
    color: var(--dash-red);
    font-size: 1rem;
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
    box-shadow: inset 0 0 0 1px rgba(36, 21, 14, 0.12);
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
    padding: 1.05rem 1.15rem;
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
      font-size: 3.15rem;
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

    .trajectory-board,
    .metric-grid,
    .summary-panel,
    .report-panel {
      box-shadow: var(--dash-shadow);
    }

    .dashboard h1 {
      font-size: 2.45rem;
    }

    .hero-copy {
      min-height: 0;
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

    .metric-grid {
      gap: 0.85rem;
    }

    .metric-card,
    .metric-card:not(:first-child) {
      border-left: 0;
      padding-left: 0;
    }

    .summary-list > div:not(:first-child) {
      border-left: 0;
      border-top: 1px solid var(--dash-divider);
      padding-left: 0;
      padding-top: 0.8rem;
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
