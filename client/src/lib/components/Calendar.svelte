<script>
  import { journal } from '$stores/journal.js';
  import { progress } from '$stores/progress.js';
  import { events } from '$stores/events.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { getDaysInMonth, getFirstDayOfMonth, getMonthValueFromDateString, isToday, isPast } from '$utils/date.js';
  import HoverPreview from './HoverPreview.svelte';

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

  const ROWS = 6;
  const TOTAL_CELLS = ROWS * 7;

  let currentYear = $derived.by(() => Number(($selectedMonth || '').slice(0, 4)));
  let currentMonth = $derived.by(() => Number(($selectedMonth || '').slice(5, 7)));
  let calendarBusy = $derived($journal.loading || $events.loading);
  let monthHeading = $derived.by(() => MONTH_NAMES[currentMonth] || '');
  let yearParts = $derived.by(() => {
    const year = String(currentYear || '').padStart(4, '0');
    return [year.slice(0, 2), year.slice(2)];
  });

  let entries = $derived.by(() => {
    const map = {};
    for (const entry of $journal.entries) {
      map[entry.date] = entry;
    }
    return map;
  });

  let eventsMap = $derived(events.getEventsByDate($events.events || []));

  let monthStats = $derived.by(() => {
    const all = Object.values(entries);
    const currentMonthEntries = all.filter((entry) => {
      const date = entry.date;
      const year = parseInt(date.slice(0, 4), 10);
      const month = parseInt(date.slice(5, 7), 10);
      return year === currentYear && month === currentMonth;
    });

    const count = currentMonthEntries.length;
    const finished = currentMonthEntries.filter((entry) => entry.status === 'finished').length;
    const hours = currentMonthEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);

    return {
      count,
      finished,
      hours: Math.round(hours * 10) / 10
    };
  });

  $effect(() => {
    if (!$selectedMonth) {
      selectedMonth.init();
      return;
    }

    journal.fetchMonth(currentYear, currentMonth);
    events.fetchMonth(currentYear, currentMonth);
  });

  let hoverVisible = $state(false);
  let hoverX = $state(0);
  let hoverY = $state(0);
  let hoverDate = $state('');
  let hoverHours = $state(0);
  let hoverEventCount = $state(0);
  let hoverDayEvents = $state([]);
  let hoverJournalStatus = $state('');
  let hoverTimeoutId = $state(null);
  let activeDate = $state('');

  function parseDate(date) {
    const [year, month, day] = date.split('-').map(Number);
    return { year, month, day };
  }

  function formatHours(value) {
    if (!value) return '0h';
    return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
  }

  function formatDateLabel(date) {
    const { year, month, day } = parseDate(date);
    return `${MONTH_NAMES[month]} ${day}, ${year}`;
  }

  function getCellMeta(date) {
    const entry = entries[date];
    const dayEvents = eventsMap[date] || [];
    const hours = Number(entry?.hours) || 0;

    if (hours > 0) return `${formatHours(hours)} logged`;
    if (dayEvents.length > 0) return dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`;
    if (entry?.status === 'finished') return 'finished';
    if ((entry?.content_raw || '').trim()) return 'journal note';
    return '';
  }

  // Keep each date button self-describing for screen readers without relying on color alone.
  function getCellAriaLabel(cell) {
    const entry = entries[cell.date];
    const dayEvents = eventsMap[cell.date] || [];
    const labelParts = [formatDateLabel(cell.date)];

    if (!cell.isCurrentMonth) {
      labelParts.push('outside the selected month');
    }

    if (isToday(cell.date)) {
      labelParts.push('today');
    }

    if (activeDate === cell.date) {
      labelParts.push('selected');
    }

    if (entry?.status === 'finished') {
      labelParts.push('journal finished');
    } else if (entry?.status === 'draft') {
      labelParts.push('journal draft');
    }

    if ((Number(entry?.hours) || 0) > 0) {
      labelParts.push(`${formatHours(Number(entry.hours))} logged`);
    }

    if (dayEvents.length > 0) {
      labelParts.push(dayEvents.length === 1 ? '1 event' : `${dayEvents.length} events`);
    }

    return labelParts.join(', ');
  }

  function handleCellMouseEnter(event, cell) {
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    let x = rect.right + 8;
    let y = rect.top;

    if (x + 220 > window.innerWidth) x = rect.left - 228;
    if (y + 200 > window.innerHeight) y = window.innerHeight - 210;
    if (y < 8) y = 8;

    hoverX = x;
    hoverY = y;
    hoverDate = cell.date;

    const entry = entries[cell.date];
    hoverHours = entry ? Number(entry.hours) || 0 : 0;
    hoverDayEvents = eventsMap[cell.date] || [];
    hoverEventCount = hoverDayEvents.length;
    hoverJournalStatus = entry?.status || '';
    hoverVisible = true;
  }

  function handleCellMouseLeave() {
    hoverTimeoutId = setTimeout(() => {
      hoverVisible = false;
      hoverTimeoutId = null;
    }, 140);
  }

  function handlePreviewEnter() {
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }
  }

  function handlePreviewLeave() {
    hoverVisible = false;
  }

  function handleQuickActionClick() {
    hoverVisible = false;
    onQuickAction(hoverDate);
  }

  function shiftMonth(delta) {
    selectedMonth.shift(delta);
  }

  function openDate(date) {
    activeDate = date;
    const monthValue = getMonthValueFromDateString(date);

    if (monthValue !== $selectedMonth) {
      selectedMonth.set(monthValue);
    }

    onDateSelect(date);
  }

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

  function cellClasses(cell) {
    const entry = entries[cell.date];
    const hasEntry = !!entry;
    const hasContent = hasEntry && ((Number(entry.hours) > 0) || (entry.content_raw && entry.content_raw.trim().length > 0));
    const checked = entry?.status === 'finished';
    const hasLoggedHours = hasEntry && Number(entry.hours) > 0;

    return [
      'calendar-date-cell',
      !cell.isCurrentMonth ? 'other-month' : '',
      isToday(cell.date) ? 'today' : '',
      isPast(cell.date) ? 'past' : '',
      hasEntry ? 'has-entry' : '',
      hasContent ? 'has-content' : '',
      checked ? 'checked' : '',
      hasLoggedHours ? 'has-hours' : '',
      (eventsMap[cell.date] || []).length > 0 ? 'has-events' : '',
      activeDate === cell.date ? 'selected' : ''
    ].filter(Boolean);
  }
</script>

<div class="calendar-view-old animate-rise rise-1" aria-busy={calendarBusy}>
  <section class="calendar-layout" aria-label={`Calendar for ${monthHeading} ${currentYear}`}>
    <header class="calendar-month-display">
      <div class="calendar-title-wrap">
        <h1 class="calendar-month-name">{monthHeading}</h1>
        {#if $progress.total_hours >= ($progress.target_hours ?? 486)}
          <p class="celebration-banner">486 hours reached</p>
        {/if}
      </div>

      <div class="calendar-header-tools">
        <div class="calendar-year" aria-label={`Year ${currentYear}`}>
          <span>{yearParts[0]}</span>
          <span>{yearParts[1]}</span>
        </div>

        <div class="calendar-nav" aria-label="Month navigation">
          <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(-1)} aria-label="Previous month">
            Prev
          </button>
          <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(1)} aria-label="Next month">
            Next
          </button>
        </div>
      </div>
    </header>

    <div class="calendar-grid-wrap">
      <div class="calendar-days-row" aria-hidden="true">
        {#each DAY_HEADERS as day}
          <span class="calendar-day-head">
            <span class="day-head-full">{day.long}</span>
            <span class="day-head-short">{day.short}</span>
          </span>
        {/each}
      </div>

      {#if calendarBusy}
        <div class="calendar-dates calendar-dates-skeleton" aria-hidden="true">
          {#each Array.from({ length: TOTAL_CELLS }) as _, index}
            <div class="calendar-skeleton-cell" style={`animation-delay: ${index * 18}ms;`}></div>
          {/each}
        </div>
      {:else}
        <div class="calendar-dates" aria-label={`Calendar for ${monthHeading} ${currentYear}`}>
          {#each calendarDays as cell, index}
            <button
              type="button"
              class={cellClasses(cell).join(' ')}
              style={`animation-delay: ${index * 18}ms;`}
              onclick={() => openDate(cell.date)}
              onmouseenter={(event) => handleCellMouseEnter(event, cell)}
              onmouseleave={handleCellMouseLeave}
              aria-current={isToday(cell.date) ? 'date' : undefined}
              aria-label={getCellAriaLabel(cell)}
            >
              <span class="calendar-day-number">{String(cell.day).padStart(2, '0')}</span>

              {#if getCellMeta(cell.date)}
                <span class="calendar-cell-meta">{getCellMeta(cell.date)}</span>
              {/if}

              <span class="calendar-cell-indicators" aria-hidden="true">
                {#if entries[cell.date]}
                  <span class:finished={entries[cell.date]?.status === 'finished'} class="calendar-cell-dot"></span>
                {/if}
                {#if (eventsMap[cell.date] || []).length > 0}
                  <span class="calendar-cell-dot calendar-cell-dot-event"></span>
                {/if}
                {#if (eventsMap[cell.date] || []).length > 1}
                  <span class="calendar-cell-dot calendar-cell-dot-muted"></span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <footer class="calendar-footer">
      <div class="calendar-month-stats">
        <span class="month-stat">{monthStats.count} {monthStats.count === 1 ? 'entry' : 'entries'}</span>
        <span class="month-stat-sep" aria-hidden="true">·</span>
        <span class="month-stat">{formatHours(monthStats.hours)} logged</span>
        <span class="month-stat-sep" aria-hidden="true">·</span>
        <span class="month-stat">{monthStats.finished} finished</span>
      </div>

      {#if $progress.current_streak > 0}
        <div class="streak-badge" title={`Current streak: ${$progress.current_streak} days`}>
          <span class="streak-flame" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 1.5C8.8 3 9.2 4.1 9.2 5.1c0 .7-.2 1.2-.5 1.6.3-.1.6-.2.9-.2 1.5 0 2.7 1.2 2.7 2.8 0 2.1-1.7 3.7-4.3 3.7S3.7 11.4 3.7 9.3c0-1.9 1.2-3.2 2.4-4.4.5-.5.9-1 1.1-1.7.1-.4.2-.9.2-1.7Z"
                fill="currentColor"
                fill-rule="evenodd"
                clip-rule="evenodd"
              />
            </svg>
          </span>
          <span class="streak-count">{$progress.current_streak}</span>
          <span class="streak-text">day streak</span>
          {#if $progress.current_streak >= $progress.longest_streak && $progress.current_streak > 1}
            <span class="streak-best">Best</span>
          {/if}
        </div>
      {/if}
    </footer>
  </section>
</div>

<HoverPreview
  visible={hoverVisible}
  x={hoverX}
  y={hoverY}
  date={hoverDate}
  hours={hoverHours}
  eventCount={hoverEventCount}
  dayEvents={hoverDayEvents}
  journalStatus={hoverJournalStatus}
  onLogHours={handleQuickActionClick}
  onAddEvent={handleQuickActionClick}
  onJournalEntry={handleQuickActionClick}
  onMouseEnter={handlePreviewEnter}
  onMouseLeave={handlePreviewLeave}
/>

<style>
  .calendar-view-old {
    width: 100%;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    padding: clamp(0.9rem, 1.7vw, 1.5rem);
  }

  .calendar-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: clamp(0.6rem, 1.1vw, 1rem);
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .calendar-month-display {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: end;
  }

  .calendar-title-wrap {
    min-width: 0;
    animation: calendarTitleIn 0.45s var(--ease-out) both;
  }

  .calendar-month-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(3.8rem, 8.4vw, 6.4rem);
    line-height: 0.88;
    letter-spacing: -0.04em;
    text-transform: uppercase;
    color: var(--red);
  }

  .celebration-banner {
    margin-top: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red-hover);
  }

  .calendar-header-tools {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.7rem;
    animation: calendarTitleIn 0.45s 0.06s var(--ease-out) both;
  }

  .calendar-year {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: var(--font-display);
    font-size: clamp(2rem, 4.5vw, 3.25rem);
    font-weight: 700;
    line-height: 0.82;
    letter-spacing: -0.05em;
    color: var(--red);
  }

  .calendar-nav {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .calendar-nav-btn {
    min-width: 4.15rem;
    min-height: 2.4rem;
    padding: 0 0.85rem;
    border: 1px solid rgba(190, 53, 25, 0.22);
    background: rgba(255, 254, 248, 0.9);
    color: var(--red);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  }

  .calendar-nav-btn:hover {
    background: rgba(190, 53, 25, 0.08);
    border-color: rgba(190, 53, 25, 0.38);
  }

  .calendar-grid-wrap {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    animation: calendarGridIn 0.55s 0.1s var(--ease-out) both;
  }

  .calendar-days-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    border-top: 1px solid rgba(190, 53, 25, 0.48);
    border-left: 1px solid rgba(190, 53, 25, 0.48);
    border-right: 1px solid rgba(190, 53, 25, 0.48);
    overflow: hidden;
  }

  .calendar-day-head {
    display: grid;
    place-items: center;
    min-height: 2rem;
    padding: 0.25rem 0.35rem;
    border-right: 1px solid rgba(190, 53, 25, 0.48);
    font-family: var(--font-ui);
    font-size: clamp(0.58rem, 0.95vw, 0.82rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--red);
    text-align: center;
  }

  .calendar-day-head:last-child {
    border-right: none;
  }

  .day-head-short {
    display: none;
  }

  .calendar-dates {
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: repeat(6, minmax(0, 1fr));
    border-left: 1px solid rgba(190, 53, 25, 0.48);
    border-right: 1px solid rgba(190, 53, 25, 0.48);
    border-bottom: 1px solid rgba(190, 53, 25, 0.48);
    background: rgba(255, 252, 246, 0.54);
  }

  .calendar-date-cell,
  .calendar-skeleton-cell {
    min-height: 0;
    border: none;
    border-top: 1px solid rgba(190, 53, 25, 0.38);
    border-right: 1px solid rgba(190, 53, 25, 0.38);
  }

  .calendar-date-cell:nth-child(7n),
  .calendar-skeleton-cell:nth-child(7n) {
    border-right: none;
  }

  .calendar-date-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 0.25rem;
    padding: 0.36rem 0.45rem 0.4rem;
    background: transparent;
    color: var(--red);
    text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
    animation: calendarCellIn 0.35s var(--ease-out) both;
  }

  .calendar-date-cell:hover {
    background: rgba(190, 53, 25, 0.05);
  }

  .calendar-date-cell.other-month {
    color: rgba(190, 53, 25, 0.28);
  }

  .calendar-date-cell.past:not(.today):not(.selected) {
    color: rgba(190, 53, 25, 0.68);
  }

  .calendar-date-cell.today {
    background: rgba(190, 53, 25, 0.07);
    box-shadow: inset 0 0 0 1px rgba(190, 53, 25, 0.24);
  }

  .calendar-date-cell.selected {
    background: rgba(190, 53, 25, 0.12);
    box-shadow: inset 0 0 0 2px rgba(190, 53, 25, 0.56);
  }

  .calendar-date-cell.checked {
    background: rgba(184, 134, 11, 0.1);
    color: #7a5c1e;
  }

  .calendar-date-cell.has-events:not(.selected):not(.today) {
    background: rgba(190, 53, 25, 0.03);
  }

  .calendar-day-number {
    align-self: flex-end;
    font-family: var(--font-ui);
    font-size: clamp(0.76rem, 1vw, 1rem);
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
  }

  .calendar-cell-meta {
    max-width: 11ch;
    font-family: var(--font-body);
    font-size: clamp(0.62rem, 0.9vw, 0.78rem);
    line-height: 1.35;
    color: rgba(120, 54, 34, 0.9);
    overflow: hidden;
    text-wrap: balance;
  }

  .calendar-date-cell.checked .calendar-cell-meta {
    color: #7a5c1e;
  }

  .calendar-cell-indicators {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    min-height: 0.35rem;
  }

  .calendar-cell-dot {
    width: 0.28rem;
    height: 0.28rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.56);
  }

  .calendar-cell-dot.finished {
    background: #7a5c1e;
  }

  .calendar-cell-dot-event {
    background: #9f5e23;
  }

  .calendar-cell-dot-muted {
    background: rgba(159, 94, 35, 0.42);
  }

  .calendar-dates-skeleton {
    background: rgba(255, 252, 246, 0.54);
  }

  .calendar-skeleton-cell {
    background: rgba(190, 53, 25, 0.03);
    animation: calendarPulse 1.1s ease-in-out infinite alternate;
  }

  .calendar-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2rem;
    animation: calendarGridIn 0.55s 0.16s var(--ease-out) both;
  }

  .calendar-month-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .month-stat-sep {
    color: rgba(190, 53, 25, 0.3);
  }

  .streak-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    color: var(--red);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    letter-spacing: 0.04em;
  }

  .streak-flame,
  .streak-count {
    color: var(--red);
  }

  .streak-count {
    font-family: var(--font-display);
    font-size: 1rem;
    line-height: 1;
  }

  .streak-text {
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .streak-best {
    margin-left: 0.2rem;
    padding: 0.08rem 0.32rem;
    border: 1px solid rgba(190, 53, 25, 0.18);
    font-size: 0.62rem;
    text-transform: uppercase;
    color: var(--red);
  }

  @keyframes calendarTitleIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes calendarGridIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes calendarCellIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
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

  @media (max-width: 920px) {
    .calendar-view-old {
      padding: 0.8rem;
    }

    .calendar-month-name {
      font-size: clamp(3rem, 10vw, 4.6rem);
    }

    .calendar-year {
      font-size: clamp(1.5rem, 5vw, 2.3rem);
    }

    .calendar-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.45rem;
    }
  }

  @media (max-width: 720px) {
    .calendar-layout {
      gap: 0.5rem;
    }

    .calendar-month-display {
      align-items: start;
    }

    .calendar-day-head {
      min-height: 1.8rem;
      font-size: 0.56rem;
    }

    .day-head-full {
      display: none;
    }

    .day-head-short {
      display: inline;
    }

    .calendar-date-cell {
      padding: 0.28rem 0.3rem 0.32rem;
    }

    .calendar-day-number {
      font-size: 0.72rem;
    }

    .calendar-cell-meta {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .calendar-view-old {
      padding: 0.65rem;
    }

    .calendar-month-display {
      grid-template-columns: 1fr;
      gap: 0.45rem;
    }

    .calendar-header-tools {
      flex-direction: row;
      justify-content: space-between;
      align-items: end;
    }

    .calendar-month-name {
      font-size: clamp(2.2rem, 12vw, 3.2rem);
    }

    .calendar-year {
      font-size: 1.35rem;
      line-height: 0.9;
    }

    .calendar-nav-btn {
      min-width: 3.35rem;
      min-height: 2.05rem;
      font-size: 0.68rem;
    }

    .calendar-day-head {
      min-height: 1.55rem;
      padding: 0.18rem;
    }

    .calendar-date-cell {
      gap: 0.18rem;
    }

    .calendar-cell-indicators {
      gap: 0.16rem;
    }

    .calendar-month-stats {
      font-size: 0.68rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .calendar-title-wrap,
    .calendar-header-tools,
    .calendar-grid-wrap,
    .calendar-footer,
    .calendar-date-cell,
    .calendar-skeleton-cell {
      animation: none !important;
    }

    .calendar-date-cell,
    .calendar-nav-btn {
      transition: none;
    }
  }
</style>
