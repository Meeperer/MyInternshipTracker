<script>
  import { journal } from '$stores/journal.js';
  import { progress } from '$stores/progress.js';
  import { events } from '$stores/events.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { getDaysInMonth, getFirstDayOfMonth, getMonthValueFromDateString, isToday, isPast } from '$utils/date.js';
  import HoverPreview from './HoverPreview.svelte';

  let { onDateSelect = () => {}, onQuickAction = () => {} } = $props();

  const MONTH_NAMES_SHORT = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  let currentYear = $derived.by(() => Number(($selectedMonth || '').slice(0, 4)));
  let currentMonth = $derived.by(() => Number(($selectedMonth || '').slice(5, 7)));
  let calendarBusy = $derived($journal.loading || $events.loading);

  let entries = $derived.by(() => {
    const map = {};
    for (const e of $journal.entries) {
      map[e.date] = e;
    }
    return map;
  });

  let eventsMap = $derived(events.getEventsByDate($events.events || []));

  let monthStats = $derived.by(() => {
    const all = Object.values(entries);
    const currentMonthEntries = all.filter(e => {
      const d = e.date;
      const y = parseInt(d.slice(0, 4));
      const m = parseInt(d.slice(5, 7));
      return y === currentYear && m === currentMonth;
    });
    const count = currentMonthEntries.length;
    const finished = currentMonthEntries.filter(e => e.status === 'finished').length;
    const hours = currentMonthEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    return { count, finished, hours: Math.round(hours * 10) / 10 };
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

  function handleCellMouseEnter(e, cell) {
    if (hoverTimeoutId) {
      clearTimeout(hoverTimeoutId);
      hoverTimeoutId = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
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
    }, 150);
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

  const ROWS = 6;
  const COLS = 7;
  const TOTAL_CELLS = ROWS * COLS;

  let calendarDays = $derived.by(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthDays = getDaysInMonth(prevYear, prevMonth);

    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    const cells = [];

    for (let i = 0; i < firstDay; i++) {
      const d = prevMonthDays - firstDay + 1 + i;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date: dateStr, isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date: dateStr, isCurrentMonth: true });
    }

    const remaining = TOTAL_CELLS - cells.length;
    for (let i = 0; i < remaining; i++) {
      const d = i + 1;
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, date: dateStr, isCurrentMonth: false });
    }

    return cells;
  });

  function cellClasses(cell) {
    const { date, isCurrentMonth } = cell;
    const entry = entries[date];
    const hasEntry = !!entry;
    const hasContent = entry && (Number(entry.hours) > 0 || (entry.content_raw && entry.content_raw.trim().length > 0));
    const checked = entry?.status === 'finished';
    const hasLoggedHours = entry && Number(entry.hours) > 0;
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    return [
      'calendar-date-cell',
      dayOfWeek === 0 ? 'sunday' : '',
      !isCurrentMonth ? 'other-month' : '',
      isToday(date) ? 'today' : '',
      isPast(date) ? 'past' : '',
      hasEntry ? 'has-entry' : '',
      hasContent ? 'has-content' : '',
      checked ? 'checked' : '',
      hasLoggedHours ? 'has-hours' : '',
      (eventsMap[date] || []).length > 0 ? 'has-events' : '',
      activeDate === date ? 'selected' : ''
    ].filter(Boolean);
  }
</script>

<div class="calendar-view-old animate-rise rise-1" aria-busy={calendarBusy}>
  {#if $progress.total_hours >= ($progress.target_hours ?? 486)}
    <div class="celebration-banner">486 HOURS REACHED | AMAZING FOCUS</div>
  {/if}

  <div class="calendar-layout">
    <div class="calendar-month-display">
      <span class="calendar-month-name">{MONTH_NAMES_SHORT[currentMonth]}</span>
      <span class="calendar-year">({currentYear})</span>
    </div>

    <div class="calendar-layout-divider" aria-hidden="true"></div>

    <div class="calendar-grid-wrap">
      <div class="calendar-days-row">
        {#each DAY_HEADERS as h}
          <span class="calendar-day-head">{h}</span>
        {/each}
      </div>

      {#if calendarBusy}
        <div class="calendar-dates calendar-dates-skeleton" aria-hidden="true">
          {#each Array.from({ length: TOTAL_CELLS }) as _, index}
            <div class="calendar-skeleton-cell skeleton-block" style={`animation-delay: ${index * 12}ms;`}></div>
          {/each}
        </div>
      {:else}
        <div class="calendar-dates" role="grid" aria-label="Calendar">
          {#each calendarDays as cell, index}
            <button
              type="button"
              class={cellClasses(cell).join(' ')}
              style={`animation-delay: ${index * 12}ms;`}
              onclick={() => openDate(cell.date)}
              onmouseenter={(e) => handleCellMouseEnter(e, cell)}
              onmouseleave={handleCellMouseLeave}
              aria-label={cell.date}
            >
              <span class="calendar-day-number">{String(cell.day).padStart(2, '0')}</span>
              <span class="calendar-cell-indicators" aria-hidden="true">
                {#if entries[cell.date]}
                  <span class:finished={entries[cell.date]?.status === 'finished'} class="calendar-cell-dot"></span>
                {/if}
                {#if (eventsMap[cell.date] || []).length > 0}
                  <span class="calendar-cell-dot calendar-cell-dot-event"></span>
                  {#if (eventsMap[cell.date] || []).length > 1}
                    <span class="calendar-cell-dot calendar-cell-dot-muted"></span>
                  {/if}
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="calendar-footer">
        <div class="calendar-month-stats">
          <span class="month-stat">{monthStats.count} {monthStats.count === 1 ? 'entry' : 'entries'}</span>
          <span class="month-stat-sep" aria-hidden="true">·</span>
          <span class="month-stat">{monthStats.hours}h logged</span>
          <span class="month-stat-sep" aria-hidden="true">·</span>
          <span class="month-stat">{monthStats.finished} finished</span>
        </div>
        {#if $progress.current_streak > 0}
          <div class="streak-badge" title="Current streak: {$progress.current_streak} days">
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
              <span class="streak-best">Best!</span>
            {/if}
          </div>
        {/if}
      </div>

      <div class="calendar-nav" aria-label="Month navigation">
        <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(-1)} aria-label="Previous month">
          &#x2190;
        </button>
        <button type="button" class="calendar-nav-btn" onclick={() => shiftMonth(1)} aria-label="Next month">
          &#x2192;
        </button>
      </div>
    </div>
  </div>
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
    display: flex;
    flex-direction: column;
    align-items: stretch;
    text-align: left;
  }

  .calendar-layout {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: center;
    gap: 0;
    width: 100%;
    max-width: 90rem;
    margin: 0 auto;
    padding: 2rem 4rem 4rem;
    flex: 1;
  }

  .calendar-month-display {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    flex: 0 0 32rem;
    width: 32rem;
    min-width: 32rem;
    overflow: hidden;
  }

  .calendar-layout-divider {
    flex: 0 0 1px;
    width: 1px;
    min-height: 12rem;
    align-self: center;
    background: var(--border);
    margin: 0 3rem;
    opacity: 0;
  }

  .calendar-month-name {
    font-family: var(--font-display);
    font-weight: 900;
    color: var(--red);
    font-size: 14rem;
    line-height: 0.92;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .calendar-year {
    font-family: var(--font-display);
    font-weight: 900;
    color: var(--red);
    font-size: 5rem;
    margin-top: -0.1em;
    letter-spacing: -0.02em;
  }

  .calendar-grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    align-items: stretch;
    flex: 0 0 42rem;
    width: 42rem;
    min-width: 42rem;
  }

  .calendar-nav {
    position: fixed;
    left: 50%;
    bottom: 1.75rem;
    transform: translateX(-50%);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2.5rem;
    font-family: var(--font-body);
    font-size: 3rem;
    z-index: 10;
  }

  .calendar-nav-btn {
    background: none;
    border: none;
    padding: 0.75rem;
    color: var(--red);
    cursor: pointer;
    line-height: 1;
    font-size: 3rem;
    font-weight: 700;
    transition: color 0.2s ease, transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .calendar-nav-btn:hover {
    color: var(--red-hover);
    transform: scale(1.15);
    outline: none;
  }
  .calendar-nav-btn:active {
    transform: scale(1.05);
  }

  .calendar-days-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0;
    font-family: var(--font-ui);
    font-size: 2.25rem;
    font-weight: 900;
    text-align: center;
    letter-spacing: 0.06em;
    min-height: 3.5rem;
  }

  .calendar-day-head {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .calendar-day-head:nth-child(1) {
    color: var(--dark);
  }
  .calendar-day-head:nth-child(n+2) {
    color: var(--red);
  }
  .calendar-day-head:nth-child(7) {
    color: var(--dark);
  }

  .calendar-dates {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: repeat(6, 1fr);
    width: 100%;
    height: min(32rem, calc(100vh - 14rem));
    min-height: 24rem;
    gap: 0.5rem;
    font-family: var(--font-display);
    font-size: 2.25rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: center;
  }

  .calendar-date-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    min-height: 0;
    padding: 0.8rem 0.75rem;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(190, 53, 25, 0.08);
    border-radius: 18px;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease,
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, box-shadow 0.2s ease;
    animation: calendarCellIn 0.35s var(--ease-out) both;
  }
  .calendar-date-cell:hover {
    opacity: 1;
    transform: translateY(-2px);
    box-shadow: 0 14px 28px rgba(34, 24, 8, 0.08);
    border-color: rgba(190, 53, 25, 0.16);
  }
  .calendar-date-cell.sunday {
    color: var(--dark);
  }
  .calendar-date-cell:not(.sunday):not(.other-month) {
    color: var(--red);
  }
  .calendar-date-cell.other-month {
    color: rgba(190, 53, 25, 0.4);
  }
  .calendar-date-cell.other-month.sunday {
    color: rgba(30, 30, 30, 0.4);
  }

  .calendar-date-cell.has-entry {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 248, 243, 0.94));
  }
  .calendar-date-cell.has-content {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 250, 238, 0.96));
  }

  .calendar-date-cell.today {
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-thickness: 2px;
    text-decoration-color: var(--red-hover);
  }
  .calendar-date-cell.past {
    opacity: 0.7;
  }
  .calendar-date-cell.checked {
    color: var(--success);
    opacity: 1;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 255, 246, 0.96));
    border-color: rgba(45, 122, 58, 0.18);
    text-decoration: none;
  }
  .calendar-date-cell.has-hours:not(.checked) {
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--red);
  }
  .calendar-date-cell.has-hours.today:not(.checked) {
    text-decoration-thickness: 2px;
    text-decoration-color: var(--red-hover);
  }

  .calendar-date-cell.selected {
    border-color: rgba(190, 53, 25, 0.34);
    box-shadow: 0 18px 30px rgba(190, 53, 25, 0.12);
    transform: translateY(-2px);
  }

  .calendar-date-cell.has-events {
    border-color: rgba(184, 134, 11, 0.14);
  }

  .calendar-day-number {
    font-family: var(--font-display);
    font-size: 1em;
    line-height: 1;
  }

  .calendar-cell-indicators {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 0.6rem;
  }

  .calendar-cell-dot {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.28);
  }

  .calendar-cell-dot.finished {
    background: var(--success);
  }

  .calendar-cell-dot-event {
    background: var(--warning);
  }

  .calendar-cell-dot-muted {
    background: rgba(184, 134, 11, 0.45);
  }

  .calendar-dates-skeleton {
    align-items: stretch;
  }

  .calendar-skeleton-cell {
    min-height: 0;
    opacity: 0.9;
    animation: calendarCellIn 0.35s var(--ease-out) both;
  }

  @keyframes calendarCellIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .calendar-footer {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 1rem;
    gap: 1.5rem;
  }

  .calendar-month-stats {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
    letter-spacing: 0.04em;
  }

  .month-stat-sep {
    color: var(--border);
    user-select: none;
  }

  .streak-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--red);
    animation: streakPulse 2s ease-in-out infinite;
  }

  .streak-flame {
    font-size: 1rem;
    line-height: 1;
  }

  .streak-count {
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--red);
  }

  .streak-text {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-soft);
  }

  .streak-best {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: var(--red);
    color: var(--bg);
    padding: 0.1rem 0.35rem;
    border-radius: 999px;
    font-weight: 700;
  }

  @keyframes streakPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.85; }
  }

  .celebration-banner {
    position: fixed;
    left: 50%;
    top: 1.25rem;
    transform: translateX(-50%);
    font-family: var(--font-body);
    font-size: 0.9rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--red);
    z-index: 20;
  }

  @media (max-width: 1200px) {
    .calendar-layout {
      padding: 2rem 2.5rem 3.5rem;
      max-width: 100%;
    }
    .calendar-layout-divider {
      margin: 0 2.5rem;
    }
    .calendar-month-display {
      flex: 0 0 26rem;
      width: 26rem;
      min-width: 26rem;
    }
    .calendar-month-name {
      font-size: 11rem;
    }
    .calendar-year {
      font-size: 4rem;
    }
    .calendar-grid-wrap {
      width: min(38rem, 100%);
      min-width: 0;
    }
    .calendar-dates {
      height: min(28rem, calc(100vh - 16rem));
      min-height: 22rem;
      font-size: 2rem;
    }
    .calendar-days-row {
      font-size: 2rem;
      min-height: 3rem;
    }
  }

  @media (max-width: 1100px) {
    .calendar-layout {
      padding: 2rem 2rem 3rem;
    }
    .calendar-layout-divider {
      margin: 0 2rem;
    }
    .calendar-month-display {
      flex: 0 0 22rem;
      width: 22rem;
      min-width: 22rem;
    }
    .calendar-month-name {
      font-size: 9rem;
    }
    .calendar-year {
      font-size: 3.25rem;
    }
    .calendar-grid-wrap {
      width: min(34rem, 100%);
    }
    .calendar-dates {
      height: min(24rem, calc(100vh - 15rem));
      min-height: 20rem;
      font-size: 1.75rem;
    }
    .calendar-days-row {
      font-size: 1.75rem;
      min-height: 2.75rem;
    }
  }

  @media (max-width: 900px) {
    .calendar-layout {
      flex-direction: column;
      gap: 0;
      padding: 1.5rem 1.5rem 3rem;
    }
    .calendar-layout-divider {
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 1px;
      margin: 1rem 0;
    }
    .calendar-month-display {
      align-items: center;
      flex: 0 0 auto;
      width: auto;
      min-width: 0;
    }
    .calendar-month-name {
      font-size: clamp(5rem, 20vw, 9rem);
    }
    .calendar-year {
      font-size: clamp(2.5rem, 10vw, 3.5rem);
      margin-top: 0;
    }
    .calendar-grid-wrap {
      max-width: 100%;
      min-width: 0;
      width: 100%;
    }
    .calendar-dates {
      height: min(20rem, calc(100vh - 18rem));
      min-height: 16rem;
      font-size: clamp(1.2rem, 4vw, 1.65rem);
    }
    .calendar-days-row {
      font-size: clamp(1.2rem, 4vw, 1.65rem);
      min-height: 2.5rem;
    }
    .calendar-footer {
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
  }

  @media (max-width: 768px) {
    .calendar-layout {
      padding: 1.25rem 1.25rem 2.5rem;
      gap: 1.75rem;
    }
    .calendar-month-name {
      font-size: clamp(4.5rem, 18vw, 7rem);
    }
    .calendar-year {
      font-size: clamp(2rem, 9vw, 3rem);
    }
    .calendar-dates {
      height: min(18rem, calc(100vh - 16rem));
      min-height: 14rem;
      font-size: clamp(1.1rem, 3.8vw, 1.4rem);
      gap: 0.35rem;
    }
    .calendar-days-row {
      font-size: clamp(1.1rem, 3.8vw, 1.4rem);
      min-height: 2.25rem;
    }
    .calendar-nav {
      bottom: 1.25rem;
      gap: 2rem;
      font-size: 2.5rem;
    }
    .calendar-nav-btn {
      font-size: 2.5rem;
    }
    .celebration-banner {
      font-size: 0.8rem;
      top: 1rem;
    }
  }

  @media (max-width: 480px) {
    .calendar-layout {
      padding: 1rem 1rem 2rem;
      gap: 1.25rem;
    }
    .calendar-month-name {
      font-size: clamp(3.5rem, 16vw, 5.5rem);
    }
    .calendar-year {
      font-size: clamp(1.5rem, 7vw, 2.5rem);
    }
    .calendar-dates {
      font-size: clamp(0.95rem, 3.2vw, 1.2rem);
      height: min(14rem, calc(100vh - 14rem));
      min-height: 12rem;
      gap: 0.25rem;
    }
    .calendar-days-row {
      font-size: clamp(0.95rem, 3.2vw, 1.2rem);
      min-height: 2rem;
    }
    .calendar-footer {
      gap: 0.35rem;
    }
    .calendar-month-stats {
      font-size: 0.7rem;
      gap: 0.35rem;
    }
    .calendar-nav {
      bottom: 1rem;
      gap: 1.75rem;
      font-size: 2.25rem;
    }
    .calendar-nav-btn {
      font-size: 2.25rem;
    }
  }

  /* Simpler calendar pass */
  .calendar-layout {
    align-items: center;
    gap: 1.5rem;
    max-width: 76rem;
    padding: 1.25rem 2rem 2rem;
  }

  .calendar-month-display {
    flex: 0 0 18rem;
    width: 18rem;
    min-width: 18rem;
    justify-content: flex-start;
  }

  .calendar-layout-divider {
    display: none;
  }

  .calendar-month-name {
    font-size: clamp(6rem, 12vw, 9rem);
    line-height: 0.9;
  }

  .calendar-year {
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    margin-top: 0.1rem;
  }

  .calendar-grid-wrap {
    flex: 1 1 auto;
    width: min(34rem, 100%);
    min-width: 0;
    gap: 0.85rem;
  }

  .calendar-nav {
    position: static;
    transform: none;
    gap: 0.65rem;
    justify-content: flex-end;
    margin-top: 0.15rem;
    font-size: 1rem;
  }

  .calendar-nav-btn {
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 1px solid rgba(190, 53, 25, 0.14);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.9);
    font-size: 1.25rem;
  }

  .calendar-nav-btn:hover {
    transform: none;
    background: rgba(190, 53, 25, 0.06);
  }

  .calendar-days-row {
    min-height: 2.3rem;
    font-size: 1.35rem;
    letter-spacing: 0.08em;
  }

  .calendar-dates {
    height: auto;
    min-height: 0;
    gap: 0.25rem;
    font-size: 1.65rem;
    letter-spacing: 0;
  }

  .calendar-date-cell {
    aspect-ratio: 1 / 0.88;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 0.22rem;
    padding: 0.35rem 0.4rem;
    background: transparent;
    border: none;
    border-radius: 12px;
    box-shadow: none;
    transition: background var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
  }

  .calendar-date-cell:hover {
    transform: none;
    box-shadow: none;
    border-color: transparent;
    background: rgba(190, 53, 25, 0.05);
  }

  .calendar-date-cell.has-entry,
  .calendar-date-cell.has-content,
  .calendar-date-cell.has-events {
    background: transparent;
    border-color: transparent;
  }

  .calendar-date-cell.today {
    background: rgba(190, 53, 25, 0.08);
    text-decoration: none;
  }

  .calendar-date-cell.checked {
    background: rgba(45, 122, 58, 0.08);
    border-color: transparent;
  }

  .calendar-date-cell.selected {
    background: rgba(190, 53, 25, 0.12);
    box-shadow: none;
    transform: none;
  }

  .calendar-date-cell.other-month {
    opacity: 0.48;
  }

  .calendar-date-cell.past:not(.selected):not(.today) {
    opacity: 0.72;
  }

  .calendar-day-number {
    font-size: 1em;
  }

  .calendar-cell-indicators {
    gap: 0.2rem;
    min-height: 0.45rem;
  }

  .calendar-cell-dot {
    width: 0.28rem;
    height: 0.28rem;
    background: rgba(190, 53, 25, 0.44);
  }

  .calendar-cell-dot-event {
    background: rgba(184, 134, 11, 0.75);
  }

  .calendar-footer {
    margin-top: 0.25rem;
    align-items: center;
  }

  .calendar-month-stats {
    font-size: 0.78rem;
  }

  .streak-badge {
    animation: none;
  }

  @media (max-width: 1100px) {
    .calendar-layout {
      padding: 1.15rem 1.5rem 1.75rem;
    }

    .calendar-month-display {
      flex-basis: 15rem;
      width: 15rem;
      min-width: 15rem;
    }
  }

  @media (max-width: 900px) {
    .calendar-layout {
      gap: 1rem;
      padding: 1rem 1.25rem 1.5rem;
    }

    .calendar-month-display {
      align-items: flex-start;
      width: 100%;
      min-width: 0;
      flex: 0 0 auto;
    }

    .calendar-grid-wrap {
      width: 100%;
    }

    .calendar-dates {
      font-size: clamp(1.1rem, 3vw, 1.45rem);
    }

    .calendar-footer {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.65rem;
    }
  }

  @media (max-width: 640px) {
    .calendar-layout {
      padding: 0.9rem 0.9rem 1.25rem;
    }

    .calendar-month-name {
      font-size: clamp(4.4rem, 17vw, 6rem);
    }

    .calendar-year {
      font-size: clamp(1.6rem, 7vw, 2.2rem);
    }

    .calendar-days-row {
      min-height: 1.8rem;
      font-size: 0.95rem;
    }

    .calendar-dates {
      gap: 0.18rem;
      font-size: clamp(0.92rem, 3.6vw, 1.12rem);
    }

    .calendar-date-cell {
      padding: 0.2rem 0.25rem;
      border-radius: 8px;
    }

    .calendar-footer {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
