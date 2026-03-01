<script>
  import { journal } from '$stores/journal.js';
  import { progress } from '$stores/progress.js';
  import { events } from '$stores/events.js';
  import { getDaysInMonth, getFirstDayOfMonth, isToday, isPast } from '$utils/date.js';
  import HoverPreview from './HoverPreview.svelte';

  let { onDateSelect = () => {}, onQuickAction = () => {} } = $props();

  let currentYear = $state(new Date().getFullYear());
  let currentMonth = $state(new Date().getMonth() + 1);

  const MONTH_NAMES_SHORT = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let entries = $derived.by(() => {
    let map = {};
    let storeVal;
    journal.subscribe(s => storeVal = s)();
    for (const e of storeVal.entries) {
      map[e.date] = e;
    }
    return map;
  });

  let eventsMap = $derived.by(() => {
    let storeVal;
    events.subscribe(s => storeVal = s)();
    return events.getEventsByDate(storeVal.events);
  });

  $effect(() => {
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
    let m = currentMonth + delta;
    let y = currentYear;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    currentMonth = m;
    currentYear = y;
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
      hasLoggedHours ? 'has-hours' : ''
    ].filter(Boolean);
  }
</script>

<div class="calendar-view-old">
  {#if $progress.total_hours >= ($progress.target_hours ?? 468)}
    <div class="celebration-banner">468 HOURS REACHED – AMAZING FOCUS</div>
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

      <div class="calendar-dates" role="grid" aria-label="Calendar">
        {#each calendarDays as cell}
          <button
            type="button"
            class={cellClasses(cell).join(' ')}
            onclick={() => onDateSelect(cell.date)}
            onmouseenter={(e) => handleCellMouseEnter(e, cell)}
            onmouseleave={handleCellMouseLeave}
            aria-label="{cell.date}"
          >
            {String(cell.day).padStart(2, '0')}
          </button>
        {/each}
      </div>

      <div class="calendar-total" class:milestone={$progress.total_hours >= ($progress.target_hours ?? 468)}>
        TOTAL: {$progress.total_hours} HOURS
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
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    padding: 0;
    transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease,
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .calendar-date-cell:hover {
    opacity: 1;
    transform: scale(1.08);
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
    background: rgba(190, 53, 25, 0.06);
  }
  .calendar-date-cell.has-content {
    background: rgba(190, 53, 25, 0.12);
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
    color: var(--dark);
    opacity: 1;
    background: rgba(190, 53, 25, 0.14);
  }
  .calendar-date-cell.checked::before {
    content: "✓";
    margin-right: 0.2em;
    font-size: 0.6em;
    letter-spacing: 0;
  }

  .calendar-date-cell.has-hours {
    text-decoration: underline;
    text-underline-offset: 0.25em;
    text-decoration-thickness: 1px;
    text-decoration-color: var(--red);
  }
  .calendar-date-cell.has-hours.today {
    text-decoration-thickness: 2px;
    text-decoration-color: var(--red-hover);
  }

  .calendar-total {
    align-self: flex-end;
    margin-top: 1rem;
    font-family: var(--font-body);
    font-size: 1rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }
  .calendar-total.milestone {
    color: var(--red);
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
    .calendar-total {
      font-size: 0.9rem;
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
    .calendar-date-cell.checked::before {
      font-size: 0.55em;
    }
    .calendar-total {
      font-size: 0.8rem;
      margin-top: 0.75rem;
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
</style>
