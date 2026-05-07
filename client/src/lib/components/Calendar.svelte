<script>
  import { onMount, tick } from 'svelte';
  import gsap from 'gsap';
  import {
    CalendarBlank,
    CaretLeft,
    CaretRight,
    CheckCircle,
    ClockCountdown,
    ListChecks,
    Plus,
    TrendUp
  } from 'phosphor-svelte';
  import { journal } from '$stores/journal.js';
  import { progress } from '$stores/progress.js';
  import { events } from '$stores/events.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import {
    formatDateLong,
    getDaysInMonth,
    getFirstDayOfMonth,
    getMonthValueFromDateString,
    isToday,
    monthValueFromDate,
    parseMonthValue,
    todayString
  } from '$utils/date.js';

  let { onDateSelect = () => {}, onQuickAction = () => {} } = $props();

  const MONTH_NAMES = [
    '',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];

  const DAY_HEADERS = [
    { long: 'Sunday', short: 'Sun' },
    { long: 'Monday', short: 'Mon' },
    { long: 'Tuesday', short: 'Tue' },
    { long: 'Wednesday', short: 'Wed' },
    { long: 'Thursday', short: 'Thu' },
    { long: 'Friday', short: 'Fri' },
    { long: 'Saturday', short: 'Sat' }
  ];

  const TOTAL_CELLS = 42;

  let calendarRoot = $state(null);
  let prefersReducedMotion = $state(false);
  let activeDate = $state('');
  let previewDate = $state('');
  let previewTray = $state({ x: 0, y: 0 });
  let entranceContext;
  let lastAnimatedKey = '';

  let currentYear = $derived.by(() => Number(($selectedMonth || '').slice(0, 4)));
  let currentMonth = $derived.by(() => Number(($selectedMonth || '').slice(5, 7)));
  let monthHeading = $derived.by(() => MONTH_NAMES[currentMonth] || '');
  let calendarBusy = $derived($journal.loading || $events.loading);

  let entries = $derived.by(() => {
    const map = {};
    for (const entry of $journal.entries) {
      map[entry.date] = entry;
    }
    return map;
  });

  let eventsMap = $derived(events.getEventsByDate($events.events || []));

  let sortedEntries = $derived.by(() =>
    [...$journal.entries].sort((a, b) => a.date.localeCompare(b.date))
  );

  function compareEvents(a, b) {
    const dateCompare = (a.date || '').localeCompare(b.date || '');
    if (dateCompare !== 0) return dateCompare;
    return String(a.start_time || '99:99').localeCompare(String(b.start_time || '99:99'));
  }

  let sortedEvents = $derived.by(() =>
    [...($events.events || [])].sort(compareEvents)
  );

  let monthStats = $derived.by(() => {
    const all = Object.values(entries);
    const count = all.length;
    const finished = all.filter((entry) => entry.status === 'finished').length;
    const hours = all.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const scheduledDays = Object.keys(eventsMap).length;
    const eventCount = sortedEvents.length;

    return {
      count,
      finished,
      hours: Math.round(hours * 10) / 10,
      scheduledDays,
      eventCount
    };
  });

  let calendarDays = $derived.by(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthDays = getDaysInMonth(prevYear, prevMonth);

    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    const cells = [];

    for (let i = 0; i < firstDay; i += 1) {
      const day = prevMonthDays - firstDay + 1 + i;
      const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, date, isCurrentMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, date, isCurrentMonth: true });
    }

    const remaining = TOTAL_CELLS - cells.length;
    for (let i = 0; i < remaining; i += 1) {
      const day = i + 1;
      const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, date, isCurrentMonth: false });
    }

    return cells;
  });

  let previewEntry = $derived.by(() => entries[previewDate] || null);
  let previewDayEvents = $derived.by(() => {
    const dayEvents = previewDate ? [...(eventsMap[previewDate] || [])] : [];
    return dayEvents.sort(compareEvents);
  });

  let upcomingEvents = $derived.by(() => {
    const pivot = activeDate || `${$selectedMonth}-01`;
    const future = sortedEvents.filter((event) => event.date >= pivot);
    return (future.length > 0 ? future : sortedEvents).slice(0, 4);
  });

  let currentMonthIsToday = $derived.by(() => $selectedMonth === monthValueFromDate());
  let todayLabel = $derived.by(() => formatDateLong(todayString()));
  let monthProgressPercent = $derived.by(() => {
    const target = Number($progress.target_hours) || 486;
    if (!target) return 0;
    return Math.min(100, Math.round((monthStats.hours / target) * 100));
  });

  let heroSummary = $derived.by(() => {
    if (monthStats.count === 0 && monthStats.eventCount === 0) {
      return `${monthHeading} is clear.`;
    }

    return `${monthStats.count} days / ${formatHours(monthStats.hours)} / ${monthStats.eventCount} items`;
  });

  function formatHours(value) {
    const normalized = Number(value) || 0;
    if (!normalized) return '0h';
    return Number.isInteger(normalized) ? `${normalized}h` : `${normalized.toFixed(1)}h`;
  }

  function truncate(value, maxLength = 144) {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return '';
    if (normalized.length > maxLength) {
      return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
    }
    return normalized;
  }

  function getEntryPreview(entry) {
    if (!entry) return '';

    const preview = [
      entry.content_ai_refined,
      entry.aras_summary,
      entry.content_raw,
      entry.aras_reflection
    ].find((value) => typeof value === 'string' && value.trim());

    return truncate(preview);
  }

  function getStatusLabel(entry) {
    if (!entry) return 'Open day';
    if (entry.status === 'finished') return 'Finished';
    if (entry.status === 'draft') return 'Draft';
    if ((entry.content_raw || '').trim()) return 'Written';
    return 'Open day';
  }

  function formatEventTimeRange(event) {
    const start = event?.start_time?.slice(0, 5);
    const end = event?.end_time?.slice(0, 5);

    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    return 'All day';
  }

  function getEventTypeLabel(type) {
    const label = String(type || 'event');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function getCellMeta(date) {
    const entry = entries[date];
    const dayEvents = eventsMap[date] || [];
    const hours = Number(entry?.hours) || 0;

    if (hours > 0) return formatHours(hours);
    if (dayEvents.length > 0) return dayEvents.length === 1 ? '1 item' : `${dayEvents.length} items`;
    if (entry?.status === 'finished') return 'Finished';
    if ((entry?.content_raw || '').trim()) return 'Written';
    return '';
  }

  function getCellAriaLabel(cell) {
    const entry = entries[cell.date];
    const dayEvents = eventsMap[cell.date] || [];
    const labelParts = [formatDateLong(cell.date)];

    if (!cell.isCurrentMonth) labelParts.push('outside the current month');
    if (isToday(cell.date)) labelParts.push('today');
    if (activeDate === cell.date) labelParts.push('selected');
    if (entry?.status === 'finished') labelParts.push('journal finished');
    if (entry?.status === 'draft') labelParts.push('journal draft');

    if ((Number(entry?.hours) || 0) > 0) {
      labelParts.push(`${formatHours(Number(entry.hours))} logged`);
    }

    if (dayEvents.length > 0) {
      labelParts.push(dayEvents.length === 1 ? '1 scheduled item' : `${dayEvents.length} scheduled items`);
    }

    return labelParts.join(', ');
  }

  function dateSummary(date, entry, dayEvents) {
    if (!date) return 'Pick a day.';

    const entryPreview = getEntryPreview(entry);
    if (entryPreview) return entryPreview;

    if (dayEvents.length > 0) return `${dayEvents.length} scheduled ${dayEvents.length === 1 ? 'item' : 'items'}.`;

    if (entry?.status === 'finished') return 'Finished for the day.';

    return 'Nothing here yet.';
  }

  function updatePreviewPosition(event) {
    if (typeof window === 'undefined' || !event?.currentTarget) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const trayWidth = 286;
    const trayHeight = 190;
    const gap = 12;

    let x = rect.right + gap;
    if (x + trayWidth > window.innerWidth - gap) {
      x = rect.left - trayWidth - gap;
    }

    let y = rect.top + rect.height / 2;
    y = Math.max(gap + trayHeight / 2, Math.min(window.innerHeight - gap - trayHeight / 2, y));

    previewTray = {
      x: Math.max(gap, x),
      y
    };
  }

  function showDatePreview(date, event) {
    previewDate = date;
    updatePreviewPosition(event);
  }

  function clearDatePreview() {
    previewDate = '';
  }

  function openDate(date) {
    activeDate = date;
    previewDate = '';

    const monthValue = getMonthValueFromDateString(date);
    if (monthValue !== $selectedMonth) {
      selectedMonth.set(monthValue);
    }

    onDateSelect(date);
  }

  function openActiveDay() {
    if (!activeDate) return;
    onDateSelect(activeDate);
  }

  function openPlannerDay(date) {
    if (!date) return;
    activeDate = date;
    onQuickAction(date);
  }

  function openTodayPlanner() {
    const today = todayString();
    selectedMonth.setFromDate(today);
    activeDate = today;
    onQuickAction(today);
  }

  function jumpToToday() {
    const today = todayString();
    selectedMonth.setFromDate(today);
    activeDate = today;
  }

  function shiftMonth(delta) {
    selectedMonth.shift(delta);
  }

  function handleMonthInputChange(event) {
    selectedMonth.set(event.currentTarget.value);
  }

  function cellClasses(cell) {
    const entry = entries[cell.date];
    const hasEntry = !!entry;
    const checked = entry?.status === 'finished';
    const hasLoggedHours = hasEntry && Number(entry.hours) > 0;
    const hasEvents = (eventsMap[cell.date] || []).length > 0;

    return [
      'calendar-day-cell',
      !cell.isCurrentMonth ? 'other-month' : '',
      isToday(cell.date) ? 'today' : '',
      activeDate === cell.date ? 'selected' : '',
      previewDate === cell.date ? 'previewed' : '',
      checked ? 'checked' : '',
      hasLoggedHours ? 'has-hours' : '',
      hasEvents ? 'has-events' : '',
      hasEntry ? 'has-entry' : ''
    ].filter(Boolean);
  }

  function defaultActiveDate() {
    const today = todayString();
    if (getMonthValueFromDateString(today) === $selectedMonth) {
      return today;
    }

    if (sortedEntries[0]?.date) return sortedEntries[0].date;
    if (sortedEvents[0]?.date) return sortedEvents[0].date;

    const { year, month } = parseMonthValue($selectedMonth || monthValueFromDate());
    return `${year}-${String(month || 1).padStart(2, '0')}-01`;
  }

  function animateEntrance() {
    if (!calendarRoot || prefersReducedMotion) return;

    entranceContext?.revert();
    entranceContext = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: {
          duration: 0.34,
          ease: 'power2.out'
        }
      });

      timeline
        .from('[data-calendar-animate="hero-copy"]', { autoAlpha: 0.9, y: 8 })
        .from('[data-calendar-animate="hero-controls"]', { autoAlpha: 0.9, y: 8 }, '-=0.22')
        .from('[data-calendar-animate="metric"]', { autoAlpha: 0.9, y: 6, stagger: 0.035, duration: 0.28 }, '-=0.2')
        .from('[data-calendar-animate="board"]', { autoAlpha: 0.94, y: 8, duration: 0.32 }, '-=0.16')
        .from('[data-calendar-animate="rail"]', { autoAlpha: 0.94, y: 8, stagger: 0.045, duration: 0.3 }, '-=0.18');
    }, calendarRoot);
  }

  function animateMonthRefresh() {
    if (!calendarRoot || prefersReducedMotion) return;

    const cells = calendarRoot.querySelectorAll('.calendar-day-cell');
    const panels = calendarRoot.querySelectorAll('[data-calendar-month-panel]');

    gsap.killTweensOf(cells);
    gsap.killTweensOf(panels);

    gsap.fromTo(
      cells,
      { autoAlpha: 0.84, y: 8, scale: 0.985 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        stagger: { each: 0.012, from: 'start' },
        duration: 0.34,
        ease: 'power2.out'
      }
    );

    gsap.fromTo(
      panels,
      { autoAlpha: 0.84, y: 10 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.38,
        stagger: 0.05,
        ease: 'power2.out'
      }
    );
  }

  $effect(() => {
    if (!$selectedMonth) {
      selectedMonth.init();
      return;
    }

    journal.fetchMonth(currentYear, currentMonth);
    events.fetchMonth(currentYear, currentMonth);
  });

  $effect(() => {
    const nextDate = defaultActiveDate();
    if (!activeDate || getMonthValueFromDateString(activeDate) !== $selectedMonth) {
      activeDate = nextDate;
    }
  });

  $effect(() => {
    const motionKey = `${$selectedMonth}:${calendarBusy}:${monthStats.count}:${monthStats.eventCount}`;
    if (!calendarRoot || calendarBusy || prefersReducedMotion || motionKey === lastAnimatedKey) return;

    lastAnimatedKey = motionKey;
    tick().then(() => {
      animateMonthRefresh();
    });
  });

  onMount(async () => {
    if (typeof window !== 'undefined') {
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    await tick();
    animateEntrance();

    return () => {
      entranceContext?.revert();
    };
  });
</script>

<div class="calendar-view" bind:this={calendarRoot} aria-busy={calendarBusy}>
  <section class="calendar-hero calendar-surface">
    <img
      class="botanical-cutout calendar-botanical-mark"
      src="/plants/palm-fan.png"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      data-tone="cream"
    />
    <div class="calendar-hero-copy" data-calendar-animate="hero-copy">
      <p class="calendar-kicker">Month plot</p>
      <div class="calendar-title-row">
        <h1>{monthHeading} <span>{currentYear}</span></h1>
      </div>
      <p class="calendar-hero-summary">{heroSummary}</p>

      <div class="calendar-hero-metrics">
        <article class="calendar-mini-stat" data-calendar-animate="metric">
          <span class="mini-label mini-label-row"><ClockCountdown size={14} weight="bold" /> Hours</span>
          <strong>{formatHours(monthStats.hours)}</strong>
          <span class="mini-note">{monthProgressPercent}% of target</span>
        </article>

        <article class="calendar-mini-stat" data-calendar-animate="metric">
          <span class="mini-label mini-label-row"><CheckCircle size={14} weight="bold" /> Done</span>
          <strong>{monthStats.finished}</strong>
          <span class="mini-note">{monthStats.count} logged days</span>
        </article>

        <article class="calendar-mini-stat" data-calendar-animate="metric">
          <span class="mini-label mini-label-row"><CalendarBlank size={14} weight="bold" /> Planned</span>
          <strong>{monthStats.scheduledDays}</strong>
          <span class="mini-note">{monthStats.eventCount} planned</span>
        </article>

        <article class="calendar-mini-stat" data-calendar-animate="metric">
          <span class="mini-label mini-label-row"><TrendUp size={14} weight="bold" /> Streak</span>
          <strong>{$progress.current_streak || 0}</strong>
          <span class="mini-note">days in a row</span>
        </article>
      </div>
    </div>

    <div class="calendar-hero-controls" data-calendar-animate="hero-controls">
      <div class="calendar-controls-copy">
        <span class="control-label">Today</span>
        <p>{todayLabel}</p>
        <span class="control-subtle">
          {#if currentMonthIsToday}
            Current month
          {:else}
            Jump back to today anytime
          {/if}
        </span>
      </div>

      <label class="calendar-input-label" for="calendar-month-input">Month</label>
      <div class="calendar-switcher">
        <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(-1)} aria-label="Previous month">
          <CaretLeft size={16} weight="bold" />
          <span>Prev</span>
        </button>

        <input
          id="calendar-month-input"
          class="calendar-month-input"
          type="month"
          value={$selectedMonth}
          onchange={handleMonthInputChange}
          aria-label="Select month"
        />

        <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(1)} aria-label="Next month">
          <span>Next</span>
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      <div class="calendar-hero-actions">
        <button
          type="button"
          class="calendar-secondary-btn"
          onclick={jumpToToday}
          disabled={currentMonthIsToday && activeDate === todayString()}
        >
          <CalendarBlank size={16} weight="bold" />
          <span>Today</span>
        </button>
        <button type="button" class="calendar-primary-btn" onclick={openTodayPlanner}>
          <Plus size={16} weight="bold" />
          <span>Write</span>
        </button>
      </div>

    </div>
  </section>

  <section class="calendar-workspace">
    <div class="calendar-board calendar-surface" data-calendar-animate="board" data-calendar-month-panel>
      <header class="calendar-board-head">
        <div>
          <p class="calendar-section-label">Month</p>
          <h2>{monthHeading}</h2>
        </div>

        <div class="calendar-legend" aria-label="Calendar state legend">
          <span class="legend-chip"><span class="legend-dot legend-today"></span>Today</span>
          <span class="legend-chip"><span class="legend-dot legend-selected"></span>Selected</span>
          <span class="legend-chip"><span class="legend-dot legend-events"></span>Scheduled</span>
        </div>
      </header>

      <div class="calendar-grid-head" aria-hidden="true">
        {#each DAY_HEADERS as day}
          <span class="calendar-day-head">
            <span class="day-head-full">{day.long}</span>
            <span class="day-head-short">{day.short}</span>
          </span>
        {/each}
      </div>

      {#if calendarBusy}
        <div class="calendar-grid calendar-grid-skeleton" aria-hidden="true">
          {#each Array.from({ length: TOTAL_CELLS }) as _, index}
            <div class="calendar-skeleton-cell" style={`animation-delay: ${index * 14}ms;`}></div>
          {/each}
        </div>
      {:else}
        <div class="calendar-grid" aria-label={`Calendar for ${monthHeading} ${currentYear}`}>
          {#each calendarDays as cell}
            <button
              type="button"
              class={cellClasses(cell).join(' ')}
              onclick={() => openDate(cell.date)}
              onmouseenter={(event) => showDatePreview(cell.date, event)}
              onmousemove={updatePreviewPosition}
              onmouseleave={clearDatePreview}
              onfocus={(event) => showDatePreview(cell.date, event)}
              onblur={clearDatePreview}
              aria-current={isToday(cell.date) ? 'date' : undefined}
              aria-pressed={activeDate === cell.date}
              aria-label={getCellAriaLabel(cell)}
            >
              <div class="calendar-cell-topline">
                <span class="calendar-day-number">{String(cell.day).padStart(2, '0')}</span>
                {#if isToday(cell.date)}
                  <span class="calendar-day-flag">Today</span>
                {/if}
              </div>

              <div class="calendar-cell-body">
                {#if entries[cell.date]?.status === 'finished'}
                  <span class="calendar-cell-status">Finished</span>
                {:else if entries[cell.date]?.status === 'draft'}
                  <span class="calendar-cell-status">Draft</span>
                {/if}

                {#if getCellMeta(cell.date)}
                  <span class="calendar-cell-meta">{getCellMeta(cell.date)}</span>
                {/if}
              </div>

              <div class="calendar-cell-indicators" aria-hidden="true">
                {#if Number(entries[cell.date]?.hours) > 0}
                  <span class="calendar-cell-pill calendar-cell-pill-hours">{formatHours(Number(entries[cell.date]?.hours))}</span>
                {/if}
                {#if (eventsMap[cell.date] || []).length > 0}
                  <span class="calendar-cell-pill calendar-cell-pill-events">
                    {(eventsMap[cell.date] || []).length} {(eventsMap[cell.date] || []).length === 1 ? 'item' : 'items'}
                  </span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <footer class="calendar-board-foot">
        <button type="button" class="calendar-foot-btn" onclick={openActiveDay} disabled={!activeDate}>
          Quick log selected day
        </button>
      </footer>
    </div>

    {#if previewDate}
      <aside
        class="calendar-hover-tray"
        style={`--tray-x: ${previewTray.x}px; --tray-y: ${previewTray.y}px;`}
        aria-hidden="true"
      >
        <div class="hover-tray-head">
          <span>{formatDateLong(previewDate)}</span>
          <strong>{getStatusLabel(previewEntry)}</strong>
        </div>

        <div class="hover-tray-tags">
          {#if previewEntry}
            <span>{formatHours(previewEntry.hours || 0)} logged</span>
          {/if}
          {#if previewDayEvents.length > 0}
            <span>{previewDayEvents.length} {previewDayEvents.length === 1 ? 'item' : 'items'}</span>
          {/if}
          {#if isToday(previewDate)}
            <span>Today</span>
          {/if}
        </div>

        <p>{dateSummary(previewDate, previewEntry, previewDayEvents)}</p>

        {#if previewDayEvents.length > 0}
          <div class="hover-tray-events">
            {#each previewDayEvents.slice(0, 2) as event}
              <div>
                <span>{formatEventTimeRange(event)}</span>
                <strong>{event.title}</strong>
              </div>
            {/each}
          </div>
        {/if}
      </aside>
    {/if}

    <aside class="calendar-rail">
      <article class="calendar-agenda-card calendar-surface" data-calendar-animate="rail" data-calendar-month-panel>
        <div class="rail-card-head">
          <div>
            <p class="calendar-section-label">Upcoming</p>
            <h3>
              {#if upcomingEvents.length > 0}
                {monthHeading}
              {:else}
                Nothing queued
              {/if}
            </h3>
          </div>

            <span class="rail-status-pill"><ListChecks size={14} weight="bold" /> {upcomingEvents.length}</span>
          </div>

        {#if upcomingEvents.length > 0}
          <div class="agenda-list">
            {#each upcomingEvents as event}
              <button type="button" class="agenda-item" onclick={() => openDate(event.date)}>
                <div class="agenda-date-block">
                  <span class="agenda-date-day">{event.date.slice(8, 10)}</span>
                  <span class="agenda-date-month">{MONTH_NAMES[Number(event.date.slice(5, 7))].slice(0, 3)}</span>
                </div>

                <div class="agenda-copy">
                  <div class="agenda-topline">
                    <span class={`event-type-chip event-type-${event.type || 'meeting'}`}>{getEventTypeLabel(event.type)}</span>
                    <span class="agenda-time">{formatEventTimeRange(event)}</span>
                  </div>
                  <strong>{event.title}</strong>
                  {#if event.description}
                    <p>{truncate(event.description, 90)}</p>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="calendar-empty-note calendar-empty-note-soft">No upcoming items.</div>
        {/if}

        <div class="agenda-footer">
          <div class="agenda-progress">
            <span class="agenda-progress-label">Target</span>
            <div class="agenda-progress-track" aria-hidden="true">
              <span class="agenda-progress-fill" style={`width: ${monthProgressPercent}%`}></span>
            </div>
            <span class="agenda-progress-meta">{monthProgressPercent}% / {formatHours(monthStats.hours)}</span>
          </div>

            <button type="button" class="calendar-foot-btn" onclick={openTodayPlanner}>
              <Plus size={16} weight="bold" />
              <span>Write</span>
            </button>
          </div>
        </article>
    </aside>
  </section>
</div>

<style>
  .calendar-view {
    width: 100%;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: clamp(0.85rem, 1.2vw, 1.2rem);
    overflow: auto;
    background:
      radial-gradient(circle at top left, rgba(11, 110, 58, 0.08), transparent 26%),
      linear-gradient(180deg, rgba(255, 254, 248, 0.98), rgba(251, 249, 236, 0.98));
  }

  .calendar-view::-webkit-scrollbar {
    width: 8px;
  }

  .calendar-view::-webkit-scrollbar-thumb {
    background: rgba(11, 110, 58, 0.18);
    border-radius: 999px;
  }

  .calendar-hero,
  .calendar-workspace {
    width: 100%;
    margin: 0;
  }

  .calendar-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .calendar-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr);
    gap: 1rem;
    align-items: start;
  }

  .calendar-surface {
    position: relative;
    overflow: hidden;
    background: rgba(255, 252, 244, 0.95);
    border: 2px solid rgba(11, 110, 58, 0.16);
    border-radius: 1.4rem;
    box-shadow:
      10px 10px 0 rgba(11, 110, 58, 0.08),
      0 18px 36px rgba(37, 21, 7, 0.08);
  }

  .calendar-surface::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .calendar-hero-copy,
  .calendar-hero-controls,
  .calendar-board,
  .calendar-agenda-card {
    position: relative;
    z-index: 1;
  }

  .calendar-hero {
    padding: clamp(1.1rem, 1.7vw, 1.5rem);
  }

  .calendar-kicker,
  .calendar-section-label,
  .mini-label,
  .control-label,
  .calendar-input-label {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--red);
  }

  .mini-label-row {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .calendar-title-row {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.55rem;
  }

  .calendar-title-row h1 {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin: 0;
    color: var(--red);
    font-size: clamp(2.35rem, 4vw, 3.8rem);
    line-height: 0.94;
    letter-spacing: 0;
  }

  .calendar-title-row h1 span {
    font-family: var(--font-ui);
    font-size: clamp(0.95rem, 1.15vw, 1.1rem);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(11, 110, 58, 0.72);
  }

  .calendar-view-tag {
    flex-shrink: 0;
    padding: 0.45rem 0.72rem;
    border: 2px solid rgba(11, 110, 58, 0.18);
    border-radius: 999px;
    background: rgba(11, 110, 58, 0.08);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
  }

  .calendar-hero-summary {
    max-width: 58ch;
    margin-top: 0.85rem;
    color: var(--dark-soft);
    font-size: 1rem;
    line-height: 1.55;
  }

  .calendar-hero-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.8rem;
    margin-top: 1.15rem;
  }

  .calendar-mini-stat {
    padding: 0.9rem 0.95rem;
    background: rgba(255, 255, 255, 0.72);
    border: 2px solid rgba(11, 110, 58, 0.1);
    border-radius: 1rem;
  }

  .calendar-mini-stat strong {
    display: block;
    margin-top: 0.35rem;
    color: var(--red);
    font-family: var(--font-display);
    font-size: clamp(1.6rem, 2vw, 2rem);
    line-height: 1;
  }

  .mini-note {
    display: block;
    margin-top: 0.35rem;
    color: var(--dark-muted);
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .calendar-hero-controls {
    display: grid;
    align-content: start;
    gap: 0.9rem;
    padding: 0.25rem 0 0 0.4rem;
  }

  .calendar-controls-copy p {
    margin-top: 0.35rem;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 1.8vw, 1.9rem);
    line-height: 1.08;
    color: var(--dark);
  }

  .control-subtle {
    display: block;
    margin-top: 0.45rem;
    color: var(--dark-muted);
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .calendar-switcher {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.6rem;
    align-items: center;
  }

  .calendar-month-input {
    min-width: 0;
    width: 100%;
    min-height: 3.2rem;
    padding: 0.85rem 1rem;
    border: 2px solid rgba(11, 110, 58, 0.16);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.78);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 700;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  }

  .calendar-month-input:focus {
    outline: none;
    border-color: rgba(11, 110, 58, 0.42);
    box-shadow: 0 0 0 4px rgba(11, 110, 58, 0.1);
  }

  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-primary-btn,
  .calendar-foot-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.9rem;
    padding: 0.7rem 1rem;
    border-radius: 1rem;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    transition:
      transform var(--transition-fast),
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-foot-btn {
    border: 2px solid rgba(11, 110, 58, 0.16);
    background: rgba(255, 255, 255, 0.82);
    color: var(--red);
  }

  .calendar-primary-btn {
    border: 2px solid var(--red);
    background: var(--red);
    color: var(--bg-soft);
    box-shadow: 0 12px 20px rgba(11, 110, 58, 0.18);
  }

  .calendar-nav-btn:hover,
  .calendar-secondary-btn:hover,
  .calendar-foot-btn:hover {
    background: rgba(11, 110, 58, 0.08);
    border-color: rgba(11, 110, 58, 0.32);
    transform: translateY(-1px);
  }

  .calendar-primary-btn:hover {
    background: var(--red-hover);
    border-color: var(--red-hover);
    transform: translateY(-1px);
    box-shadow: 0 14px 24px rgba(11, 110, 58, 0.24);
  }

  .calendar-nav-btn:active,
  .calendar-secondary-btn:active,
  .calendar-primary-btn:active,
  .calendar-foot-btn:active {
    transform: translateY(0);
  }

  .calendar-nav-btn:disabled,
  .calendar-secondary-btn:disabled,
  .calendar-primary-btn:disabled,
  .calendar-foot-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .calendar-hero-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .calendar-controls-note {
    color: var(--dark-muted);
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .calendar-board,
  .calendar-agenda-card {
    padding: 1.05rem;
  }

  .calendar-board {
    min-width: 0;
  }

  .calendar-board-head,
  .rail-card-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .calendar-board-head h2,
  .rail-card-head h3 {
    margin: 0.2rem 0 0;
    color: var(--red);
    font-size: clamp(1.55rem, 2.3vw, 2rem);
    line-height: 1;
  }

  .calendar-legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .legend-chip,
  .rail-status-pill,
  .selected-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.42rem 0.65rem;
    border: 1px solid rgba(11, 110, 58, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.7);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .legend-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: rgba(11, 110, 58, 0.22);
  }

  .legend-today {
    background: var(--red);
  }

  .legend-selected {
    background: rgba(11, 110, 58, 0.46);
  }

  .legend-events {
    background: var(--moss);
  }

  .calendar-grid-head {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 1rem;
    margin-bottom: 0.45rem;
  }

  .calendar-day-head {
    padding: 0.55rem 0.45rem;
    border: 2px solid rgba(11, 110, 58, 0.12);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.62);
    text-align: center;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
  }

  .day-head-short {
    display: none;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .calendar-day-cell,
  .calendar-skeleton-cell {
    min-width: 0;
    min-height: 0;
    border-radius: 1.1rem;
    border: 2px solid rgba(11, 110, 58, 0.1);
    background: rgba(255, 255, 255, 0.76);
  }

  .calendar-day-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.45rem;
    aspect-ratio: 1.42 / 1;
    padding: 0.72rem;
    text-align: left;
    color: var(--dark);
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .calendar-day-cell:hover {
    transform: translateY(-2px);
    border-color: rgba(11, 110, 58, 0.28);
    box-shadow: 0 10px 18px rgba(37, 21, 7, 0.08);
  }

  .calendar-day-cell.other-month {
    color: rgba(58, 58, 58, 0.45);
    background: rgba(255, 255, 255, 0.46);
  }

  .calendar-day-cell.today {
    border-color: rgba(11, 110, 58, 0.4);
    background: rgba(11, 110, 58, 0.08);
  }

  .calendar-day-cell.selected {
    border-color: var(--red);
    background: rgba(11, 110, 58, 0.12);
    box-shadow:
      6px 6px 0 rgba(11, 110, 58, 0.12),
      0 12px 20px rgba(37, 21, 7, 0.09);
  }

  .calendar-day-cell.checked:not(.selected):not(.today) {
    background: rgba(45, 122, 58, 0.08);
    border-color: rgba(45, 122, 58, 0.22);
  }

  .calendar-cell-topline {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.45rem;
  }

  .calendar-day-number {
    font-family: var(--font-display);
    font-size: clamp(1.2rem, 1.55vw, 1.55rem);
    line-height: 1;
    color: var(--red);
  }

  .calendar-day-flag,
  .calendar-cell-status {
    display: inline-flex;
    align-items: center;
    padding: 0.24rem 0.46rem;
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .calendar-day-flag {
    background: var(--red);
    color: var(--bg-soft);
  }

  .calendar-cell-status {
    width: fit-content;
    background: rgba(11, 110, 58, 0.08);
    color: rgba(126, 40, 21, 0.88);
  }

  .calendar-cell-body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .calendar-cell-meta {
    color: var(--dark-soft);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .calendar-cell-indicators {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .calendar-cell-pill,
  .event-type-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    padding: 0.24rem 0.5rem;
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .calendar-cell-pill-hours {
    background: rgba(11, 110, 58, 0.09);
    color: var(--red);
  }

  .calendar-cell-pill-events {
    background: rgba(89, 107, 64, 0.14);
    color: var(--moss);
  }

  .event-type-meeting {
    background: rgba(11, 110, 58, 0.1);
    color: var(--red);
  }

  .event-type-deadline {
    background: rgba(30, 30, 30, 0.1);
    color: var(--dark);
  }

  .event-type-reminder {
    background: rgba(89, 107, 64, 0.16);
    color: var(--moss);
  }

  .event-type-personal {
    background: rgba(45, 122, 58, 0.12);
    color: var(--leaf);
  }

  .calendar-grid-skeleton {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .calendar-skeleton-cell {
    aspect-ratio: 1.42 / 1;
    background: rgba(11, 110, 58, 0.05);
    animation: calendarPulse 1.1s ease-in-out infinite alternate;
  }

  .calendar-board-foot,
  .agenda-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-top: 0.95rem;
    padding-top: 0.95rem;
    border-top: 1px solid rgba(11, 110, 58, 0.1);
  }

  .calendar-empty-note,
  .agenda-progress-meta,
  .agenda-copy p {
    color: var(--dark-soft);
    font-size: 0.92rem;
    line-height: 1.48;
  }

  .calendar-rail {
    display: grid;
    gap: 1rem;
  }

  .agenda-list {
    display: grid;
    gap: 0.7rem;
    margin-top: 1rem;
  }

  .agenda-item {
    border: 2px solid rgba(11, 110, 58, 0.1);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.74);
  }

  .agenda-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    margin-bottom: 0.45rem;
  }

  .agenda-copy strong {
    color: var(--dark);
    font-size: 0.96rem;
    line-height: 1.35;
  }

  .agenda-time {
    color: var(--dark-muted);
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .calendar-empty-note {
    margin-top: 1rem;
    padding: 0.9rem 1rem;
    border: 2px dashed rgba(11, 110, 58, 0.16);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.54);
  }

  .calendar-empty-note-soft {
    margin-top: 1rem;
  }

  .agenda-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    width: 100%;
    padding: 0.75rem;
    text-align: left;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }

  .agenda-item:hover {
    transform: translateY(-2px);
    border-color: rgba(11, 110, 58, 0.24);
    background: rgba(11, 110, 58, 0.04);
  }

  .agenda-date-block {
    width: 3.3rem;
    min-width: 3.3rem;
    padding: 0.55rem 0.35rem;
    border: 2px solid rgba(11, 110, 58, 0.12);
    border-radius: 0.9rem;
    background: rgba(11, 110, 58, 0.06);
    text-align: center;
  }

  .agenda-date-day {
    display: block;
    color: var(--red);
    font-family: var(--font-display);
    font-size: 1.4rem;
    line-height: 1;
  }

  .agenda-date-month {
    display: block;
    margin-top: 0.2rem;
    color: var(--dark-muted);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .agenda-copy {
    min-width: 0;
  }

  .agenda-progress {
    flex: 1 1 auto;
    min-width: 0;
  }

  .agenda-progress-label {
    display: block;
    margin-bottom: 0.45rem;
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .agenda-progress-track {
    position: relative;
    width: 100%;
    height: 0.7rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(11, 110, 58, 0.08);
    border: 1px solid rgba(11, 110, 58, 0.08);
  }

  .agenda-progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(11, 110, 58, 0.92), rgba(5, 45, 25, 0.82));
  }

  .calendar-surface {
    border-width: 1px;
    box-shadow: 0 8px 18px rgba(37, 21, 7, 0.04);
  }

  .calendar-surface::before {
    box-shadow: none;
  }

  .calendar-hero-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem 1.15rem;
    margin-top: 1rem;
    padding-top: 0.95rem;
    border-top: 1px solid rgba(11, 110, 58, 0.12);
  }

  .calendar-mini-stat {
    min-width: 8.5rem;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .calendar-board-head,
  .rail-card-head {
    padding-bottom: 0.85rem;
    border-bottom: 1px solid rgba(11, 110, 58, 0.08);
  }

  .legend-chip,
  .rail-status-pill,
  .selected-tag {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .calendar-grid-head {
    gap: 0.3rem;
  }

  .calendar-day-head {
    padding: 0.35rem 0.25rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    border-bottom: 1px solid rgba(11, 110, 58, 0.12);
  }

  .calendar-day-cell,
  .calendar-skeleton-cell {
    border-width: 1px;
    border-radius: 0.82rem;
    background: rgba(255, 255, 255, 0.58);
  }

  .calendar-day-cell:hover {
    transform: none;
    box-shadow: none;
    background: rgba(11, 110, 58, 0.05);
  }

  .calendar-day-cell.selected {
    box-shadow: inset 0 0 0 1px rgba(11, 110, 58, 0.14);
  }

  .agenda-list {
    gap: 0;
  }

  .agenda-item {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .agenda-item + .agenda-item {
    margin-top: 0.8rem;
    padding-top: 0.8rem;
    border-top: 1px solid rgba(11, 110, 58, 0.1);
  }

  .agenda-item {
    padding: 0.65rem 0;
  }

  .agenda-item:hover {
    transform: none;
    border-color: transparent;
    background: rgba(11, 110, 58, 0.03);
  }

  .agenda-date-block {
    width: auto;
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }

  .calendar-empty-note {
    padding: 0.9rem 0 0;
    border: 0;
    border-top: 1px dashed rgba(11, 110, 58, 0.18);
    border-radius: 0;
    background: transparent;
  }

  .calendar-view {
    background:
      linear-gradient(rgba(42, 34, 23, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(42, 34, 23, 0.035) 1px, transparent 1px),
      var(--bg);
    background-size: 30px 30px, 30px 30px, auto;
  }

  .calendar-surface {
    background: rgba(255, 250, 232, 0.94);
    border: 2px solid rgba(42, 34, 23, 0.78);
    border-radius: 10px;
    box-shadow: 5px 5px 0 rgba(42, 34, 23, 0.1);
  }

  .calendar-hero {
    position: relative;
    align-items: stretch;
    isolation: isolate;
    overflow: hidden;
  }

  .calendar-botanical-mark {
    position: absolute;
    right: clamp(-6rem, -5vw, -2.2rem);
    bottom: clamp(-7rem, -6vw, -3.4rem);
    z-index: 0;
    width: clamp(16rem, 28vw, 24rem);
    height: auto;
    opacity: 0.08;
    pointer-events: none;
    transform: rotate(-10deg);
  }

  .calendar-hero-copy {
    min-height: 15rem;
    padding-right: clamp(0rem, 10vw, 7rem);
  }

  .calendar-title-row h1,
  .calendar-board-head h2,
  .rail-card-head h3,
  .calendar-mini-stat strong,
  .agenda-date-day,
  .calendar-day-number {
    color: var(--red);
  }

  .calendar-kicker,
  .calendar-section-label,
  .mini-label,
  .control-label,
  .calendar-input-label {
    color: var(--red);
    letter-spacing: 0.14em;
  }

  .calendar-view-tag,
  .calendar-cell-status,
  .calendar-cell-pill-hours,
  .event-type-meeting,
  .calendar-day-cell.today,
  .calendar-day-cell.selected,
  .calendar-primary-btn,
  .calendar-day-flag {
    border-color: rgba(42, 34, 23, 0.76);
  }

  .calendar-hero-metrics,
  .calendar-board-head,
  .rail-card-head,
  .calendar-board-foot,
  .agenda-footer {
    border-color: rgba(42, 34, 23, 0.12);
  }

  .calendar-mini-stat {
    min-width: 7.4rem;
  }

  .calendar-month-input,
  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-primary-btn,
  .calendar-foot-btn {
    border-radius: 6px;
    border-width: 2px;
  }

  .calendar-month-input,
  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-foot-btn {
    border-color: rgba(42, 34, 23, 0.68);
    background: var(--paper-strong);
  }

  .calendar-primary-btn {
    background: var(--red);
    color: var(--bg-soft);
    box-shadow: 4px 4px 0 rgba(42, 34, 23, 0.13);
  }

  .calendar-primary-btn:hover,
  .calendar-nav-btn:hover,
  .calendar-secondary-btn:hover,
  .calendar-foot-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 rgba(42, 34, 23, 0.12);
  }

  .calendar-day-cell,
  .calendar-skeleton-cell {
    border-radius: 8px;
    border: 1px solid rgba(42, 34, 23, 0.18);
    background: rgba(255, 252, 240, 0.72);
  }

  .calendar-day-cell.selected {
    background: rgba(49, 95, 54, 0.12);
    border-color: rgba(42, 34, 23, 0.82);
  }

  .calendar-day-cell.today {
    background: rgba(111, 125, 58, 0.12);
  }

  .agenda-progress-fill,
  .trend-bar-fill {
    background: var(--red);
  }

  .event-type-deadline {
    background: rgba(42, 34, 23, 0.1);
    color: var(--soil);
  }

  /* Eco-enterprise calendar pass */
  .calendar-view {
    background:
      linear-gradient(rgba(36, 24, 15, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(36, 24, 15, 0.04) 1px, transparent 1px),
      var(--bg);
    background-size: 32px 32px, 32px 32px, auto;
  }

  .calendar-hero {
    border-color: rgba(36, 24, 15, 0.92);
    border-radius: 8px;
    background:
      linear-gradient(rgba(248, 239, 212, 0.075) 1px, transparent 1px),
      linear-gradient(90deg, rgba(248, 239, 212, 0.075) 1px, transparent 1px),
      var(--canopy);
    background-size: 24px 24px, 24px 24px, auto;
    color: var(--cream);
  }

  .calendar-surface,
  .calendar-mini-stat,
  .calendar-month-input,
  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-primary-btn,
  .calendar-foot-btn,
  .calendar-day-head,
  .calendar-day-cell,
  .calendar-skeleton-cell,
  .legend-chip,
  .rail-status-pill,
  .selected-tag {
    border-radius: 8px;
  }

  .calendar-surface,
  .calendar-mini-stat,
  .calendar-day-cell,
  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-primary-btn,
  .calendar-foot-btn {
    transition: transform 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out),
      border-color 0.16s var(--ease-out), background-color 0.16s var(--ease-out);
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .calendar-surface:hover {
      box-shadow: 5px 5px 0 rgba(36, 24, 15, 0.14);
    }

    .calendar-mini-stat:hover,
    .calendar-day-cell:hover {
      transform: translate(-1px, -1px);
      box-shadow: 4px 4px 0 rgba(36, 24, 15, 0.1);
    }
  }

  .calendar-title-row h1,
  .calendar-title-row h1 span,
  .calendar-hero-summary,
  .calendar-controls-copy p,
  .control-subtle {
    color: var(--cream);
  }

  .calendar-kicker,
  .calendar-hero .mini-label,
  .calendar-hero .control-label,
  .calendar-hero .calendar-input-label {
    color: var(--pollen);
  }

  .calendar-botanical-mark {
    opacity: 0.08;
  }

  .calendar-mini-stat {
    min-width: 0;
    padding: 0.72rem 0.75rem;
    border: 1px solid rgba(248, 239, 212, 0.22);
    background: rgba(248, 239, 212, 0.08);
  }

  .calendar-mini-stat:last-child {
    border-right: 1px solid rgba(248, 239, 212, 0.22);
  }

  .calendar-mini-stat strong,
  .calendar-hero .mini-note {
    color: var(--cream);
    opacity: 1;
  }

  .calendar-hero .mini-note {
    color: rgba(248, 239, 212, 0.78);
  }

  .calendar-hero-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
    border-top-color: rgba(248, 239, 212, 0.18);
  }

  .calendar-hero-controls {
    padding: 1rem;
    border: 1px solid rgba(248, 239, 212, 0.2);
    background: rgba(248, 239, 212, 0.08);
  }

  .calendar-surface {
    border-color: rgba(36, 24, 15, 0.9);
    border-radius: 8px;
    background: var(--paper-strong);
    box-shadow: 5px 5px 0 rgba(36, 24, 15, 0.12);
  }

  .calendar-hero.calendar-surface {
    background:
      linear-gradient(rgba(248, 239, 212, 0.075) 1px, transparent 1px),
      linear-gradient(90deg, rgba(248, 239, 212, 0.075) 1px, transparent 1px),
      var(--canopy);
    background-size: 24px 24px, 24px 24px, auto;
  }

  .calendar-board {
    background: var(--cream);
  }

  .calendar-board-head h2,
  .rail-card-head h3,
  .calendar-day-number,
  .agenda-date-day {
    color: var(--canopy);
  }

  .calendar-section-label,
  .calendar-input-label,
  .control-label,
  .mini-label {
    color: var(--leaf);
  }

  .calendar-month-input,
  .calendar-nav-btn,
  .calendar-secondary-btn,
  .calendar-foot-btn {
    border-color: rgba(36, 24, 15, 0.72);
    background: var(--paper-strong);
    color: var(--canopy);
  }

  .calendar-primary-btn {
    border-color: rgba(36, 24, 15, 0.88);
    background: var(--paprika);
    color: var(--cream);
    box-shadow: 4px 4px 0 rgba(36, 24, 15, 0.16);
  }

  .calendar-primary-btn:hover {
    background: var(--moss);
    border-color: rgba(36, 24, 15, 0.88);
  }

  .calendar-day-head {
    color: var(--canopy);
    border-color: rgba(36, 24, 15, 0.18);
  }

  .calendar-day-cell,
  .calendar-skeleton-cell {
    border: 1px solid rgba(36, 24, 15, 0.22);
    background: rgba(255, 246, 210, 0.66);
  }

  .calendar-day-cell:hover {
    background: rgba(216, 227, 184, 0.22);
  }

  .calendar-day-cell.previewed:not(.selected) {
    background: rgba(216, 227, 184, 0.26);
    border-color: rgba(36, 24, 15, 0.72);
  }

  .calendar-day-cell.today {
    background: rgba(216, 227, 184, 0.32);
    border-color: rgba(36, 24, 15, 0.88);
  }

  .calendar-day-cell.selected {
    background: var(--canopy);
    color: var(--cream);
    border-color: rgba(36, 24, 15, 0.95);
    box-shadow: inset 0 0 0 1px rgba(248, 239, 212, 0.24);
  }

  .calendar-day-cell.selected .calendar-day-number,
  .calendar-day-cell.selected .calendar-cell-meta,
  .calendar-day-cell.selected .calendar-cell-status {
    color: var(--cream);
  }

  .calendar-day-flag,
  .calendar-cell-pill-hours,
  .event-type-meeting,
  .agenda-progress-fill {
    background: var(--leaf);
    color: var(--cream);
  }

  .calendar-cell-pill-events,
  .event-type-reminder {
    background: var(--pollen-soft);
    color: var(--soil);
  }

  .event-type-personal {
    background: var(--paprika-soft);
    color: var(--paprika);
  }

  .agenda-date-block {
    color: var(--canopy);
  }

  .calendar-workspace {
    position: relative;
    grid-template-columns: minmax(0, 1fr);
  }

  .calendar-board.calendar-surface {
    overflow: visible;
  }

  .calendar-rail {
    display: block;
  }

  .calendar-agenda-card {
    padding: 0.95rem 1rem;
  }

  .calendar-agenda-card .agenda-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
    margin-top: 0.85rem;
  }

  .calendar-agenda-card .agenda-item {
    padding: 0.75rem;
    border: 1px solid rgba(36, 24, 15, 0.16);
    border-radius: 8px;
    background: rgba(255, 252, 240, 0.58);
  }

  .calendar-agenda-card .agenda-item + .agenda-item {
    margin-top: 0;
    border-top: 1px solid rgba(36, 24, 15, 0.16);
  }

  .calendar-hover-tray {
    position: fixed;
    left: var(--tray-x);
    top: var(--tray-y);
    z-index: 200;
    width: min(17.875rem, calc(100vw - 1.5rem));
    padding: 0.85rem;
    border: 2px solid rgba(36, 24, 15, 0.9);
    border-radius: 8px;
    background: var(--paper-strong);
    color: var(--canopy);
    box-shadow: 6px 6px 0 rgba(36, 24, 15, 0.16);
    pointer-events: none;
    transform: translateY(-50%);
    animation: calendarTrayIn 0.14s var(--ease-out) both;
  }

  .hover-tray-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid rgba(36, 24, 15, 0.14);
  }

  .hover-tray-head span,
  .hover-tray-events span {
    color: var(--moss);
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hover-tray-head strong {
    flex-shrink: 0;
    color: var(--leaf);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hover-tray-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.7rem;
  }

  .hover-tray-tags span {
    display: inline-flex;
    padding: 0.22rem 0.48rem;
    border: 1px solid rgba(36, 24, 15, 0.18);
    border-radius: 999px;
    background: var(--pollen-soft);
    color: var(--canopy);
    font-family: var(--font-ui);
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .calendar-hover-tray p {
    margin-top: 0.7rem;
    color: var(--dark-soft);
    font-size: 0.88rem;
    line-height: 1.42;
  }

  .hover-tray-events {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.75rem;
  }

  .hover-tray-events div {
    display: grid;
    gap: 0.18rem;
    padding-top: 0.55rem;
    border-top: 1px solid rgba(36, 24, 15, 0.12);
  }

  .hover-tray-events strong {
    color: var(--canopy);
    font-size: 0.9rem;
    line-height: 1.25;
  }

  @keyframes calendarTrayIn {
    from {
      opacity: 0;
      transform: translateY(calc(-50% + 4px)) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
  }

  @keyframes calendarPulse {
    from {
      opacity: 0.62;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 1260px) {
    .calendar-hero,
    .calendar-workspace {
      width: 100%;
    }

    .calendar-hero {
      grid-template-columns: 1fr;
    }

    .calendar-hero-controls {
      padding-left: 0;
    }
  }

  @media (max-width: 1120px) {
    .calendar-workspace {
      grid-template-columns: 1fr;
    }

    .calendar-agenda-card .agenda-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .calendar-hero-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .calendar-view {
      padding: 0.8rem;
    }

    .calendar-title-row {
      flex-direction: column;
      align-items: start;
    }

    .calendar-grid-head,
    .calendar-grid {
      gap: 0.35rem;
    }

    .calendar-day-head {
      padding: 0.45rem 0.3rem;
    }

    .calendar-day-cell {
      padding: 0.58rem;
    }

    .calendar-board-foot,
    .agenda-footer {
      flex-direction: column;
      align-items: stretch;
    }
  }

  @media (max-width: 720px) {
    .calendar-view {
      padding: 0.65rem;
    }

    .calendar-hero,
    .calendar-board,
    .calendar-agenda-card {
      padding: 0.9rem;
    }

    .calendar-hero-metrics {
      grid-template-columns: 1fr;
    }

    .calendar-switcher,
    .calendar-hero-actions,
    .calendar-agenda-card .agenda-list {
      grid-template-columns: 1fr;
    }

    .calendar-grid-head {
      gap: 0.25rem;
    }

    .calendar-grid {
      gap: 0.28rem;
    }

    .day-head-full {
      display: none;
    }

    .day-head-short {
      display: inline;
    }

    .calendar-day-cell {
      aspect-ratio: auto;
      min-height: 6.2rem;
      padding: 0.5rem;
    }

    .calendar-cell-meta,
    .calendar-cell-status {
      font-size: 0.72rem;
    }
  }

  @media (max-width: 560px) {
    .calendar-view {
      padding: 0.5rem;
    }

    .calendar-title-row h1 {
      font-size: 2rem;
    }

    .calendar-title-row h1 span {
      display: block;
      margin-top: 0.2rem;
      font-size: 0.82rem;
    }

    .calendar-workspace,
    .calendar-rail {
      gap: 0.75rem;
    }

    .calendar-grid-head {
      margin-top: 0.85rem;
    }

    .calendar-day-head {
      font-size: 0.62rem;
      border-radius: 0.75rem;
    }

    .calendar-day-number {
      font-size: 1rem;
    }

    .calendar-cell-meta {
      display: none;
    }

    .legend-chip,
    .rail-status-pill,
    .selected-tag {
      font-size: 0.64rem;
    }

    .agenda-item {
      grid-template-columns: 1fr;
    }

    .agenda-date-block {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
    }

    .agenda-date-day,
    .agenda-date-month {
      display: inline;
      margin: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .calendar-day-cell,
    .calendar-nav-btn,
    .calendar-secondary-btn,
    .calendar-primary-btn,
    .calendar-foot-btn,
    .agenda-item,
    .calendar-month-input {
      transition: none !important;
      animation: none !important;
      transform: none !important;
    }

    .calendar-hover-tray {
      animation: none !important;
    }
  }

  @media (hover: none) {
    .calendar-hover-tray {
      display: none;
    }
  }

  /* Viewport calendar pass */
  .calendar-view {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.75rem;
    height: 100%;
    max-height: 100%;
    overflow: hidden;
  }

  .calendar-hero {
    margin-bottom: 0;
    grid-template-columns: minmax(0, 1.1fr) minmax(20rem, 0.72fr);
    gap: 0.75rem;
    padding: 0.85rem;
  }

  .calendar-hero-copy {
    min-height: 0;
    padding-right: 0;
  }

  .calendar-hero-summary {
    margin-top: 0.45rem;
    font-size: 0.9rem;
  }

  .calendar-hero-metrics {
    display: none;
  }

  .calendar-mini-stat {
    padding: 0.58rem 0.65rem;
  }

  .calendar-mini-stat strong {
    font-size: clamp(1.2rem, 1.65vw, 1.55rem);
  }

  .mini-note {
    font-size: 0.74rem;
  }

  .calendar-hero-controls {
    gap: 0.55rem;
    padding: 0.85rem;
  }

  .calendar-controls-copy,
  .calendar-hero-actions {
    display: none;
  }

  .calendar-workspace {
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }

  .calendar-rail {
    display: none;
  }

  .calendar-board {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .calendar-board-foot {
    display: none;
  }

  .calendar-grid {
    min-height: 0;
    grid-template-rows: repeat(6, minmax(0, 1fr));
  }

  .calendar-grid-skeleton {
    min-height: 0;
  }

  .calendar-day-cell,
  .calendar-skeleton-cell {
    aspect-ratio: auto;
    min-height: 0;
    overflow: hidden;
  }

  @media (min-width: 761px) and (max-width: 980px) {
    .calendar-view {
      gap: 0.6rem;
      padding: 0.65rem;
    }

    .calendar-hero {
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.7fr);
      gap: 0.65rem;
      padding: 0.75rem;
    }

    .calendar-hero-copy {
      min-height: 0;
      padding-right: 0;
    }

    .calendar-hero-summary,
    .calendar-controls-copy,
    .calendar-botanical-mark {
      display: none;
    }

    .calendar-title-row {
      margin-top: 0;
    }

    .calendar-title-row h1 {
      font-size: clamp(2.1rem, 5vw, 3rem);
    }

    .calendar-hero-metrics {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.45rem;
      margin-top: 0.65rem;
      padding-top: 0.65rem;
    }

    .calendar-mini-stat {
      padding: 0.55rem;
    }

    .calendar-mini-stat strong {
      font-size: 1.35rem;
    }

    .mini-note {
      font-size: 0.72rem;
    }

    .calendar-hero-controls {
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .calendar-hero-actions {
      display: none;
    }

    .calendar-board {
      padding: 0.7rem;
    }

    .calendar-board-head {
      padding-bottom: 0.5rem;
    }

    .calendar-grid-head {
      margin-top: 0.45rem;
      margin-bottom: 0.35rem;
    }
  }

  @media (max-width: 760px) {
    .calendar-view {
      gap: 0.45rem;
      padding: 0.45rem;
    }

    .calendar-hero {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.5rem;
      padding: 0.55rem;
    }

    .calendar-hero-copy {
      min-height: 0;
      padding-right: 0;
    }

    .calendar-kicker,
    .calendar-hero-summary,
    .calendar-hero-metrics,
    .calendar-controls-copy,
    .calendar-input-label,
    .calendar-botanical-mark {
      display: none;
    }

    .calendar-title-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0;
    }

    .calendar-title-row h1 {
      display: flex;
      align-items: baseline;
      gap: 0.45rem;
      font-size: clamp(1.45rem, 8vw, 1.95rem);
      line-height: 0.95;
      white-space: nowrap;
    }

    .calendar-title-row h1 span {
      display: inline;
      margin-top: 0;
      font-size: 0.72rem;
    }

    .calendar-hero-controls {
      display: grid;
      gap: 0.45rem;
      padding: 0;
      border: 0;
      background: transparent;
    }

    .calendar-switcher {
      grid-template-columns: 2.55rem minmax(0, 1fr) 2.55rem;
      gap: 0.35rem;
    }

    .calendar-nav-btn,
    .calendar-month-input,
    .calendar-primary-btn,
    .calendar-secondary-btn {
      min-height: 2.35rem;
      border-radius: 6px;
    }

    .calendar-nav-btn {
      padding: 0;
    }

    .calendar-nav-btn span {
      display: none;
    }

    .calendar-month-input {
      padding: 0.42rem 0.55rem;
      font-size: 0.82rem;
    }

    .calendar-hero-actions {
      display: none;
    }

    .calendar-board {
      grid-template-rows: auto auto minmax(0, 1fr);
      padding: 0.45rem;
      border-width: 1px;
      box-shadow: none;
    }

    .calendar-board-head {
      align-items: center;
      padding-bottom: 0.35rem;
      border-bottom-color: rgba(36, 24, 15, 0.12);
    }

    .calendar-section-label,
    .calendar-legend,
    .calendar-board-foot {
      display: none;
    }

    .calendar-board-head h2 {
      margin: 0;
      font-size: 1.15rem;
    }

    .calendar-grid-head {
      gap: 0.18rem;
      margin: 0.28rem 0;
    }

    .calendar-day-head {
      padding: 0.08rem 0;
      border: 0;
      border-radius: 0;
      font-size: 0.54rem;
      line-height: 1.2;
    }

    .day-head-full {
      display: none;
    }

    .day-head-short {
      display: inline;
    }

    .calendar-grid {
      gap: 0.18rem;
    }

    .calendar-day-cell,
    .calendar-skeleton-cell {
      border-radius: 6px;
    }

    .calendar-day-cell {
      gap: 0.12rem;
      padding: 0.25rem;
      border-width: 1px;
    }

    .calendar-day-cell:hover {
      transform: none;
      box-shadow: none;
    }

    .calendar-cell-topline {
      align-items: center;
    }

    .calendar-day-number {
      font-size: clamp(0.78rem, 3.5vw, 0.98rem);
      line-height: 1;
    }

    .calendar-day-flag,
    .calendar-cell-body,
    .calendar-cell-meta,
    .calendar-cell-status {
      display: none;
    }

    .calendar-cell-indicators {
      position: absolute;
      left: 0.25rem;
      right: 0.25rem;
      bottom: 0.25rem;
      display: flex;
      justify-content: flex-start;
      gap: 0.16rem;
    }

    .calendar-cell-pill {
      width: 0.38rem;
      height: 0.38rem;
      padding: 0;
      border-radius: 999px;
      overflow: hidden;
      text-indent: 150%;
      white-space: nowrap;
    }
  }

  @media (max-width: 390px), (max-height: 760px) and (max-width: 760px) {
    .calendar-view {
      gap: 0.32rem;
      padding: 0.35rem;
    }

    .calendar-hero {
      padding: 0.45rem;
    }

    .calendar-title-row h1 {
      font-size: 1.35rem;
    }

    .calendar-switcher {
      grid-template-columns: 2.25rem minmax(0, 1fr) 2.25rem;
    }

    .calendar-nav-btn,
    .calendar-month-input {
      min-height: 2.1rem;
    }

    .calendar-board {
      padding: 0.35rem;
    }

    .calendar-board-head h2 {
      font-size: 1rem;
    }

    .calendar-day-number {
      font-size: 0.76rem;
    }
  }
</style>
