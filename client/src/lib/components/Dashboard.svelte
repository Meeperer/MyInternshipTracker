<script>
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import { events } from '$stores/events.js';
  import { toast } from '$stores/toast.js';
  import { todayString } from '$utils/date.js';
  import ProgressBar from './ProgressBar.svelte';
  import { onMount } from 'svelte';
  import { api } from '$utils/api.js';

  let { onNavigateToDate = () => {} } = $props();

  let compilationStatus = $state(null);
  let compiling = $state(false);
  let downloading = $state(false);
  let todayEvents = $state([]);

  const CURRENT_MONTH = new Date().getMonth() + 1;
  const CURRENT_YEAR = new Date().getFullYear();
  const NOW = new Date();

  let monthStats = $derived.by(() => {
    const entries = $journal.entries || [];
    const relevant = entries.filter(e => {
      const y = parseInt(e.date.slice(0, 4));
      const m = parseInt(e.date.slice(5, 7));
      return y === CURRENT_YEAR && m === CURRENT_MONTH;
    });
    const count = relevant.length;
    const finished = relevant.filter(e => e.status === 'finished').length;
    const hours = relevant.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    return { count, finished, hours: Math.round(hours * 10) / 10 };
  });

  let weeklyInsights = $derived.by(() => {
    const entries = $journal.entries || [];
    const today = new Date();
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    let thisWeekHours = 0;
    let thisWeekDays = 0;
    let prevWeekHours = 0;

    for (const e of entries) {
      const d = new Date(e.date + 'T00:00:00');
      const h = Number(e.hours) || 0;
      if (d >= weekStart) {
        thisWeekHours += h;
        if (h > 0) thisWeekDays++;
      } else if (d >= prevWeekStart && d < weekStart) {
        prevWeekHours += h;
      }
    }

    const trend = prevWeekHours > 0
      ? Math.round(((thisWeekHours - prevWeekHours) / prevWeekHours) * 100)
      : thisWeekHours > 0 ? 100 : 0;

    const remaining = $progress.remaining_hours;
    const avgDaily = $progress.days_completed > 0
      ? $progress.total_hours / $progress.days_completed
      : 8;

    // Compute how many working days (Mon–Fri) you still need,
    // then convert that to a calendar date by skipping weekends.
    const workingDaysNeeded = avgDaily > 0 ? Math.ceil(remaining / avgDaily) : 0;
    let projectedDate = 'Complete!';

    if (workingDaysNeeded > 0) {
      let date = new Date();
      let remainingWorkDays = workingDaysNeeded;
      // Walk forward counting only Mon–Fri as working days
      while (remainingWorkDays > 0) {
        date.setDate(date.getDate() + 1);
        const dow = date.getDay(); // 0 = Sun, 6 = Sat
        if (dow !== 0 && dow !== 6) {
          remainingWorkDays--;
        }
      }
      projectedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    return {
      thisWeekHours: Math.round(thisWeekHours * 10) / 10,
      thisWeekDays,
      trend,
      avgDaily: Math.round(avgDaily * 10) / 10,
      projectedCompletion: projectedDate,
      daysNeeded: workingDaysNeeded
    };
  });

  function formatTimeRange(ev) {
    const s = ev.start_time?.slice(0, 5);
    const e = ev.end_time?.slice(0, 5);
    if (s && e) return `${s} – ${e}`;
    if (s) return s;
    if (e) return `until ${e}`;
    return '';
  }

  const QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
    { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Consistency is the hallmark of the unimaginative.", author: "Oscar Wilde" },
    { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
    { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
    { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
    { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" }
  ];

  let todayQuote = $derived.by(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return QUOTES[dayOfYear % QUOTES.length];
  });

  onMount(() => {
    api.get('/compilation/status').then(s => compilationStatus = s).catch(() => {});
    journal.fetchMonth(CURRENT_YEAR, CURRENT_MONTH);
    events.fetchDate(todayString()).then(list => (todayEvents = list || []));
  });

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
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Internship_Journal_Report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      downloading = false;
    }
  }

  let greetingLabel = $derived.by(() => {
    const pct = $progress.percentage;
    if (pct >= 100) return 'Complete!';
    if (pct >= 75) return 'Almost there';
    if (pct >= 50) return 'Halfway mark';
    if (pct >= 25) return 'Great progress';
    return 'Getting started';
  });
</script>

<div class="dashboard">
  <header class="dash-header">
    <h1>Internship Tracker</h1>
    <p class="dash-subtitle">{$progress.target_hours}-Hour Compliance System</p>
  </header>

  <div class="quote-card card">
    <blockquote class="quote-text">"{todayQuote.text}"</blockquote>
    <cite class="quote-author">— {todayQuote.author}</cite>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-value">{$progress.total_hours}</span>
      <span class="stat-label">Hours Rendered</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{$progress.remaining_hours}</span>
      <span class="stat-label">Remaining</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{$progress.days_completed}</span>
      <span class="stat-label">Days Completed</span>
    </div>
    <div class="stat-card">
      <span class="stat-value">{$progress.current_streak}</span>
      <span class="stat-label">Day Streak</span>
    </div>
  </div>

  <div class="milestone-badge">
    <span class="milestone-label">{greetingLabel}</span>
    <span class="milestone-bar">
      <span class="milestone-fill" style="width: {Math.min($progress.percentage, 100)}%"></span>
    </span>
    <span class="milestone-pct">{$progress.percentage}%</span>
  </div>

  <div class="insights-card card">
    <h3>Weekly Insights</h3>
    <div class="insights-grid">
      <div class="insight">
        <span class="insight-value">{weeklyInsights.thisWeekHours}h</span>
        <span class="insight-label">This Week</span>
      </div>
      <div class="insight">
        <span class="insight-value">{weeklyInsights.thisWeekDays}</span>
        <span class="insight-label">Days Active</span>
      </div>
      <div class="insight">
        <span class="insight-value" class:trend-up={weeklyInsights.trend > 0} class:trend-down={weeklyInsights.trend < 0}>
          {weeklyInsights.trend > 0 ? '+' : ''}{weeklyInsights.trend}%
        </span>
        <span class="insight-label">vs Last Week</span>
      </div>
      <div class="insight">
        <span class="insight-value">{weeklyInsights.avgDaily}h</span>
        <span class="insight-label">Avg / Day</span>
      </div>
    </div>
    {#if !$progress.is_completed}
      <div class="projection">
        <span class="projection-label">Projected completion</span>
        <span class="projection-value">{weeklyInsights.projectedCompletion}</span>
        <span class="projection-detail">({weeklyInsights.daysNeeded} working days remaining)</span>
      </div>
    {/if}
  </div>

  <div class="progress-section card">
    <h3>Progress</h3>
    <ProgressBar
      percentage={$progress.percentage}
      total={$progress.total_hours}
      target={$progress.target_hours}
    />
    <p class="progress-hint">Log hours from the Journal — open a date and use "Log Hours" or "Edit Entry".</p>
  </div>

  {#if $progress.is_completed}
    <div class="completion-banner card">
      <h2>{$progress.target_hours} Hours Complete!</h2>
      <p>Your internship hours requirement has been fulfilled.</p>
      {#if compilationStatus?.has_report}
        <button class="btn btn-primary" onclick={handleDownload} disabled={downloading}>
          {downloading ? 'Downloading...' : 'Download Report (PDF)'}
        </button>
      {:else}
        <button class="btn btn-primary" onclick={handleCompile} disabled={compiling}>
          {compiling ? 'Compiling...' : 'Compile Final Report'}
        </button>
      {/if}
    </div>
  {/if}

  {#if todayEvents.length > 0}
    <div class="today-events card">
      <h3>Today's Events</h3>
      <ul class="today-events-list">
        {#each todayEvents as ev}
          <li class="today-event-item">
            <span class="today-event-title">{ev.title}</span>
            {#if formatTimeRange(ev)}
              <span class="today-event-time">{formatTimeRange(ev)}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <button class="btn btn-sm" onclick={() => onNavigateToDate(todayString())}>
        Open today in Calendar
      </button>
    </div>
  {/if}

  <div class="quick-access card">
    <h3>Quick Access</h3>
    <p class="quick-access-hint">Add or edit today's journal and log rendered hours.</p>
    <button class="btn" onclick={() => onNavigateToDate(todayString())}>
      Open Today's Entry
    </button>
  </div>
</div>

<style>
  .dashboard {
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: min(1400px, 92vw);
    margin: 0 auto;
    padding: clamp(2rem, 4vw, 4rem) clamp(2rem, 5vw, 5rem) clamp(3rem, 6vw, 6rem);
    display: flex;
    flex-direction: column;
    gap: clamp(1.75rem, 3vw, 2.75rem);
  }

  .dash-header {
    text-align: center;
    margin-bottom: 0.25rem;
  }

  .dash-header h1 {
    font-size: clamp(2.5rem, 5vw, 4.25rem);
    margin-bottom: 0.35rem;
  }

  .dash-subtitle {
    font-family: var(--font-ui);
    font-size: clamp(0.85rem, 1.2vw, 1.1rem);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--dark-soft);
  }

  .quote-card {
    text-align: center;
    padding: 1.75rem 2.5rem;
    background: rgba(190, 53, 25, 0.03);
    border: 1px solid rgba(190, 53, 25, 0.1);
  }

  .quote-text {
    font-family: var(--font-display);
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    color: var(--dark);
    line-height: 1.6;
    font-style: italic;
    margin-bottom: 0.5rem;
  }

  .quote-author {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--red);
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: clamp(1.25rem, 2vw, 2rem);
  }

  .stat-card {
    position: relative;
    background: white;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: clamp(1.5rem, 2.5vw, 2.5rem);
    text-align: center;
    box-shadow: var(--shadow);
    transition: transform 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out),
      border-color 0.2s ease;
  }
  .stat-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    border-color: var(--border);
  }

  .stat-value {
    display: block;
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 4vw, 3.75rem);
    color: var(--red);
    line-height: 1.2;
  }

  .stat-label {
    display: block;
    font-family: var(--font-ui);
    font-size: clamp(0.7rem, 1vw, 0.9rem);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--dark-soft);
    margin-top: 0.5rem;
  }

  .milestone-badge {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: white;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }

  .milestone-label {
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--red);
    min-width: 120px;
  }

  .milestone-bar {
    flex: 1;
    height: 6px;
    background: var(--border-light);
    border-radius: 3px;
    overflow: hidden;
  }

  .milestone-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--red), var(--red-hover));
    border-radius: 3px;
    transition: width 0.7s var(--ease-out);
  }

  .milestone-pct {
    flex-shrink: 0;
    font-family: var(--font-display);
    font-size: 0.9rem;
    color: var(--red);
    font-weight: 600;
    min-width: 3rem;
    text-align: right;
  }

  .progress-section {
    padding: clamp(1.5rem, 2.5vw, 2.25rem);
  }

  .progress-section h3 {
    margin-bottom: 1.25rem;
    font-size: clamp(1.2rem, 1.8vw, 1.5rem);
  }

  .progress-hint {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
    margin-top: 1rem;
    line-height: 1.5;
  }

  .quick-access-hint {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--dark-soft);
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .completion-banner {
    text-align: center;
    border-color: var(--success);
    background: #f0fdf4;
    padding: clamp(1.75rem, 3vw, 2.5rem);
  }

  .completion-banner h2 {
    color: var(--success);
    margin-bottom: 0.5rem;
    font-size: clamp(1.5rem, 2.2vw, 2rem);
  }

  .completion-banner p {
    font-size: clamp(0.95rem, 1.1vw, 1.1rem);
    color: var(--dark-soft);
    margin-bottom: 1.25rem;
  }

  .completion-banner .btn {
    padding: 0.85rem 1.75rem;
    font-size: 1rem;
  }

  .today-events {
    padding: clamp(1.5rem, 2.5vw, 2.25rem);
  }

  .today-events h3 {
    font-size: clamp(1.2rem, 1.8vw, 1.5rem);
    margin-bottom: 1rem;
  }

  .today-events-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem 0;
  }

  .today-event-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
    font-family: var(--font-body);
  }

  .today-event-item:last-child {
    border-bottom: none;
  }

  .today-event-title {
    display: block;
    font-weight: 600;
    color: var(--dark);
    font-size: 0.95rem;
  }

  .today-event-time {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--dark-soft);
    letter-spacing: 0.02em;
    margin-top: 0.15rem;
  }

  .today-events .btn {
    padding: 0.5rem 1.25rem;
    font-size: 0.85rem;
  }

  .insights-card {
    padding: clamp(1.5rem, 2.5vw, 2.25rem);
  }

  .insights-card h3 {
    font-size: clamp(1.2rem, 1.8vw, 1.5rem);
    margin-bottom: 1.25rem;
  }

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .insight {
    text-align: center;
    padding: 0.75rem 0.5rem;
    background: rgba(190, 53, 25, 0.03);
    border-radius: var(--radius);
  }

  .insight-value {
    display: block;
    font-family: var(--font-display);
    font-size: clamp(1.25rem, 2vw, 1.75rem);
    color: var(--red);
    line-height: 1.3;
    font-weight: 700;
  }

  .insight-value.trend-up {
    color: var(--success);
  }

  .insight-value.trend-down {
    color: var(--warning);
  }

  .insight-label {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dark-soft);
    margin-top: 0.25rem;
  }

  .projection {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
    flex-wrap: wrap;
  }

  .projection-label {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dark-soft);
  }

  .projection-value {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--red);
    font-weight: 600;
  }

  .projection-detail {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--dark-soft);
  }

  .quick-access {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: clamp(1.5rem, 2.5vw, 2.25rem);
  }

  .quick-access h3 {
    font-size: clamp(1.2rem, 1.8vw, 1.5rem);
  }

  .quick-access .btn {
    padding: 0.85rem 1.75rem;
    font-size: 1rem;
  }

  @media (max-width: 992px) {
    .dashboard {
      padding: 2.5rem 2rem 3rem;
      gap: 1.75rem;
    }
    .dash-header h1 { font-size: 2.75rem; }
    .stat-value { font-size: 2.5rem; }
    .stat-card { padding: 1.5rem; }
    .quote-card { padding: 1.5rem 2rem; }
  }

  @media (max-width: 768px) {
    .dashboard {
      padding: 2rem 1.5rem 2.5rem;
      gap: 1.5rem;
    }
    .dash-header h1 { font-size: 2.35rem; }
    .dash-subtitle { font-size: 0.9rem; }
    .stats-grid { gap: 1.25rem; }
    .stat-value { font-size: 2.25rem; }
    .stat-label { font-size: 0.75rem; }
    .progress-section h3,
    .quick-access h3 { font-size: 1.2rem; }
    .milestone-badge { padding: 0.65rem 1rem; gap: 0.75rem; }
    .milestone-label { min-width: 90px; font-size: 0.72rem; }
  }

  @media (max-width: 600px) {
    .dashboard {
      padding: 1.75rem 1.25rem 2rem;
      gap: 1.25rem;
    }
    .stats-grid,
    .insights-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    .dash-header h1 { font-size: 2rem; }
    .stat-value { font-size: 2rem; }
    .stat-card { padding: 1.25rem; }
  }

  @media (max-width: 480px) {
    .dashboard {
      padding: 1.5rem 1rem 1.75rem;
    }
    .dash-header h1 { font-size: 1.75rem; }
    .stat-value { font-size: 1.85rem; }
    .stat-card { padding: 1rem; }
    .completion-banner h2 { font-size: 1.5rem; }
    .quick-access {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .quick-access .btn {
      width: 100%;
      justify-content: center;
    }
    .quote-card { padding: 1.25rem 1rem; }
    .quote-text { font-size: 0.95rem; }
    .milestone-badge { flex-wrap: wrap; }
  }
</style>
