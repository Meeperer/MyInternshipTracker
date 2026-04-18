<script>
  import { journal } from '$stores/journal.js';
  import { toast } from '$stores/toast.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import {
    formatDate,
    getMonthRange,
    monthValueFromDate,
    parseMonthValue,
    shiftDate,
    todayString,
    toDateString
  } from '$utils/date.js';

  let { onDateSelect = () => {} } = $props();

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long'
  });

  const RANGE_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  });

  function formatMonthLabel(monthValue) {
    const { year, month } = parseMonthValue(monthValue);
    return MONTH_LABEL_FORMATTER.format(new Date(year, (month || 1) - 1, 1));
  }

  function formatRangeLabel(startDate, endDate) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    return startDate === endDate
      ? RANGE_LABEL_FORMATTER.format(start)
      : `${RANGE_LABEL_FORMATTER.format(start)} - ${RANGE_LABEL_FORMATTER.format(end)}`;
  }

  function getWeekOptions(monthValue) {
    const { startDate, endDate } = getMonthRange(monthValue);
    const options = [];
    let cursor = startDate;
    let index = 1;

    while (cursor <= endDate) {
      const weekStart = cursor;
      const provisionalEnd = shiftDate(weekStart, 6);
      const weekEnd = provisionalEnd > endDate ? endDate : provisionalEnd;

      options.push({
        key: `${weekStart}:${weekEnd}`,
        label: `Week ${index} - ${formatRangeLabel(weekStart, weekEnd)}`,
        startDate: weekStart,
        endDate: weekEnd
      });

      cursor = shiftDate(weekEnd, 1);
      index += 1;
    }

    return options;
  }

  function formatHoursValue(hours) {
    const normalized = Number(hours) || 0;
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  }

  function formatHoursAsHMS(hours) {
    const h = Number(hours);
    if (isNaN(h) || h < 0) return '00:00:00';
    const totalSec = Math.round(h * 3600);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function hasSummaryContent(entry) {
    return [
      entry.content_raw,
      entry.content_ai_refined,
      entry.aras_action,
      entry.aras_reflection,
      entry.aras_analysis,
      entry.aras_summary
    ].some((value) => typeof value === 'string' && value.trim().length >= 10);
  }

  function formatDateReadable(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function entriesToMarkdown(entries, monthValue) {
    const totalHours = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const lines = [
      '# Internship Journal Export',
      `**Month:** ${formatMonthLabel(monthValue)}`,
      `**Exported:** ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`,
      `**Total Entries:** ${entries.length}`,
      `**Total Hours:** ${formatHoursValue(totalHours)}`,
      '',
      '---',
      ''
    ];

    if (entries.length === 0) {
      lines.push('*No journal entries were recorded in this month.*');
      lines.push('');
      return lines.join('\n');
    }

    for (const entry of entries) {
      lines.push(`## ${formatDateReadable(entry.date)}`);
      lines.push('');
      lines.push(`**Hours:** ${formatHoursValue(entry.hours)} | **Status:** ${entry.status}`);
      lines.push('');

      if (entry.content_raw) {
        lines.push(entry.content_raw);
        lines.push('');
      } else {
        lines.push('*No content recorded.*');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  let exportLoading = $state(false);
  let exportFormat = $state('markdown');
  let searchQuery = $state('');
  let summaryMode = $state('month');
  let selectedWeekKey = $state('');
  let summaryLoading = $state(false);
  let summaryFetching = $state(false);
  let summaryResult = $state(null);
  let summaryError = $state('');
  let summaryRequestId = 0;

  let weekOptions = $derived.by(() => getWeekOptions($selectedMonth || monthValueFromDate()));
  let filtered = $derived.by(() => {
    if (!searchQuery.trim()) return $journal.entries;
    const q = searchQuery.toLowerCase();
    return $journal.entries.filter((entry) =>
      (entry.content_raw || '').toLowerCase().includes(q) ||
      (entry.date || '').includes(q)
    );
  });

  let monthHours = $derived.by(() =>
    $journal.entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
  );

  let monthFinishedCount = $derived.by(() =>
    $journal.entries.filter((entry) => entry.status === 'finished').length
  );

  let selectedWeek = $derived.by(
    () => weekOptions.find((week) => week.key === selectedWeekKey) || weekOptions[0] || null
  );

  let activeSummaryRange = $derived.by(() => {
    if (!$selectedMonth) return null;
    if (summaryMode === 'week') return selectedWeek;
    return {
      key: $selectedMonth,
      label: formatMonthLabel($selectedMonth),
      ...getMonthRange($selectedMonth)
    };
  });

  let rangeEntries = $derived.by(() => {
    if (!activeSummaryRange) return [];
    return $journal.entries.filter(
      (entry) => entry.date >= activeSummaryRange.startDate && entry.date <= activeSummaryRange.endDate
    );
  });

  let rangeHours = $derived.by(() =>
    rangeEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
  );

  let rangeContentCount = $derived.by(() =>
    rangeEntries.filter((entry) => hasSummaryContent(entry)).length
  );

  $effect(() => {
    if (!$selectedMonth) {
      selectedMonth.init();
      return;
    }

    const { year, month } = parseMonthValue($selectedMonth);
    journal.fetchMonth(year, month);
  });

  $effect(() => {
    if (!weekOptions.length) {
      selectedWeekKey = '';
      return;
    }

    if (!weekOptions.some((week) => week.key === selectedWeekKey)) {
      selectedWeekKey = weekOptions[0].key;
    }
  });

  $effect(() => {
    const range = activeSummaryRange;
    if (!range) {
      summaryResult = null;
      summaryError = '';
      summaryFetching = false;
      return;
    }

    summaryResult = null;
    summaryError = '';
    summaryFetching = true;
    const requestId = ++summaryRequestId;

    journal.fetchPeriodSummary(summaryMode, range.startDate, range.endDate)
      .then((saved) => {
        if (requestId !== summaryRequestId) return;
        summaryResult = saved
          ? {
              ...saved,
              label: range.label
            }
          : null;
      })
      .catch(() => {
        if (requestId !== summaryRequestId) return;
        summaryResult = null;
      })
      .finally(() => {
        if (requestId === summaryRequestId) {
          summaryFetching = false;
        }
      });
  });

  function openNewEntryForToday() {
    const today = todayString();
    selectedMonth.setFromDate(today);
    onDateSelect(today);
  }

  async function handleExportMonth() {
    exportLoading = true;

    try {
      const entries = [...$journal.entries];

      let blob;
      let filename;

      if (exportFormat === 'markdown') {
        blob = new Blob([entriesToMarkdown(entries, $selectedMonth)], { type: 'text/markdown' });
        filename = `journal-entries-${$selectedMonth}.md`;
      } else {
        blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        filename = `journal-entries-${$selectedMonth}.json`;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(
        entries.length
          ? `Exported ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from ${formatMonthLabel($selectedMonth)}`
          : `Exported an empty ${formatMonthLabel($selectedMonth)} journal file`
      );
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      exportLoading = false;
    }
  }

  async function handleGenerateSummary() {
    if (!activeSummaryRange) return;

    if (rangeContentCount === 0) {
      summaryError = `Add written journal content in this ${summaryMode} before generating a summary.`;
      toast.error(summaryError);
      return;
    }

    summaryLoading = true;
    summaryError = '';

    try {
      const result = await journal.summarizePeriod(
        summaryMode,
        activeSummaryRange.startDate,
        activeSummaryRange.endDate
      );

      summaryResult = {
        ...result,
        label: activeSummaryRange.label
      };

      toast.success(`${summaryMode === 'week' ? 'Weekly' : 'Monthly'} summary ready`);
    } catch (err) {
      summaryError = err.message || 'AI summary failed';
      toast.error(summaryError);
    } finally {
      summaryLoading = false;
    }
  }
</script>

<div class="journal-view">
  <section class="journal-hero">
    <div class="journal-hero-copy">
      <span class="eyebrow">Journal workspace</span>
      <h2>Journal Entries</h2>
      <p class="journal-subtitle">
        Move month by month, export what matters, and turn your notes into a clean weekly or monthly readout.
      </p>
    </div>

    <div class="journal-hero-actions">
      <button type="button" class="nav-chip" onclick={() => selectedMonth.shift(-1)} aria-label="Previous month">
        Prev
      </button>
      <input
        id="journal-month"
        class="hero-month-input"
        type="month"
        bind:value={$selectedMonth}
        aria-label="Select journal month"
      />
      <button type="button" class="nav-chip" onclick={() => selectedMonth.shift(1)} aria-label="Next month">
        Next
      </button>
      <button class="btn btn-sm btn-primary hero-new-entry" onclick={openNewEntryForToday}>
        New Entry
      </button>
    </div>
  </section>

  <section class="overview-strip">
    <article class="overview-card">
      <span class="overview-label">Selected month</span>
      <strong>{formatMonthLabel($selectedMonth)}</strong>
      <p>{$journal.entries.length} entr{$journal.entries.length === 1 ? 'y' : 'ies'} tracked</p>
    </article>
    <article class="overview-card">
      <span class="overview-label">Hours logged</span>
      <strong>{formatHoursValue(monthHours)}</strong>
      <p>Across the current month</p>
    </article>
    <article class="overview-card">
      <span class="overview-label">Finished days</span>
      <strong>{monthFinishedCount}</strong>
      <p>Locked and completed</p>
    </article>
  </section>

  <section class="workspace-grid">
    <div class="journal-controls card glass-card">
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Export</span>
          <h3>Monthly export</h3>
        </div>
      </div>

      <div class="panel-body">
        <div class="control-block">
          <label class="label" for="journal-export-format">Format</label>
          <select id="journal-export-format" class="export-select" bind:value={exportFormat} aria-label="Export format">
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </select>
        </div>

        <div class="control-block action-block">
          <span class="label">Download</span>
          <button
            class="btn btn-sm btn-primary action-button"
            onclick={handleExportMonth}
            disabled={exportLoading || $journal.loading}
            title="Download all entries from the selected month"
          >
            {exportLoading ? 'Exporting...' : 'Export Month'}
          </button>
        </div>
      </div>

      <p class="control-hint">
        Pull a clean file for {formatMonthLabel($selectedMonth)} in either readable markdown or raw JSON.
      </p>
    </div>

    <div class="summary-panel card glass-card">
      <div class="summary-topline">
        <div>
          <span class="panel-kicker">AI summary</span>
          <h3>Period summary</h3>
          <p class="summary-caption">Summarize the whole month or narrow it down to a week inside the current month.</p>
        </div>

        <div class="period-toggle" role="tablist" aria-label="AI summary range">
          <button
            class:active={summaryMode === 'week'}
            type="button"
            onclick={() => (summaryMode = 'week')}
          >
            Weekly
          </button>
          <button
            class:active={summaryMode === 'month'}
            type="button"
            onclick={() => (summaryMode = 'month')}
          >
            Monthly
          </button>
        </div>
      </div>

      <div class="summary-controls">
        {#if summaryMode === 'week'}
          <select class="summary-select" bind:value={selectedWeekKey} aria-label="Select week to summarize">
            {#each weekOptions as week}
              <option value={week.key}>{week.label}</option>
            {/each}
          </select>
        {:else}
          <div class="summary-range-chip">{formatMonthLabel($selectedMonth)}</div>
        {/if}

        <button
          class="btn btn-sm btn-primary action-button"
          onclick={handleGenerateSummary}
          disabled={$journal.loading || summaryLoading || rangeContentCount === 0}
        >
          {summaryLoading ? 'Summarizing...' : summaryMode === 'week' ? 'Summarize Week' : 'Summarize Month'}
        </button>
      </div>

      {#if activeSummaryRange}
        <div class="summary-stats">
          <span>{activeSummaryRange.label}</span>
          <span>{rangeEntries.length} entr{rangeEntries.length === 1 ? 'y' : 'ies'}</span>
          <span>{formatHoursValue(rangeHours)} hours</span>
          <span>{rangeContentCount} with content</span>
        </div>
      {/if}

      {#if summaryError}
        <div class="summary-state summary-state-error" role="alert">
          <strong>Summary unavailable right now</strong>
          <p>{summaryError}</p>
        </div>
      {:else if summaryFetching}
        <div class="summary-state">
          <strong>Checking saved summaries</strong>
          <p>Looking for an existing {summaryMode} summary for this range.</p>
        </div>
      {:else if summaryResult}
        <div class="summary-result">
          <div class="summary-result-header">
            <span class="summary-result-label">{summaryResult.label}</span>
            <span class:summary-live={!summaryResult.persisted} class="summary-save-pill">
              {summaryResult.persisted === false ? 'Live only' : 'Saved'}
            </span>
          </div>
          <p>{summaryResult.summary}</p>
          <p class="summary-footnote">
            Updated {new Date(summaryResult.updated_at || toDateString(new Date())).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })} · {summaryResult.entry_count} entr{summaryResult.entry_count === 1 ? 'y' : 'ies'} · {formatHoursValue(summaryResult.total_hours)} hours
          </p>
          {#if summaryResult.persisted === false}
            <p class="summary-warning">
              This summary was generated successfully, but automatic saving is not available until the latest database migration is applied.
            </p>
          {/if}
        </div>
      {:else}
        <div class="summary-state">
          <strong>No saved summary yet</strong>
          <p>
            {rangeContentCount > 0
              ? `Generate a ${summaryMode} summary to get a concise readout of your progress, themes, and next priorities.`
              : `This ${summaryMode} does not have enough written journal content yet for AI summarization.`}
          </p>
        </div>
      {/if}
    </div>
  </section>

  <div class="search-shell">
    <input
      class="input search-input"
      type="text"
      placeholder="Search entries by content or date..."
      bind:value={searchQuery}
      aria-label="Search journal entries"
    />
  </div>

  <div class="entries-list" aria-live="polite">
    {#if $journal.loading}
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Loading {formatMonthLabel($selectedMonth)} entries...</p>
      </div>
    {:else if $journal.entries.length === 0}
      <div class="empty-state card glass-card">
        <div class="empty-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </div>
        <p>No journal entries recorded in {formatMonthLabel($selectedMonth)}.</p>
        <button class="btn btn-sm btn-primary" onclick={openNewEntryForToday}>
          Create a new entry
        </button>
      </div>
    {:else if filtered.length === 0}
      <div class="empty-state card glass-card">
        <p>No entries match "{searchQuery}" in {formatMonthLabel($selectedMonth)}.</p>
        <button class="btn btn-sm" onclick={() => (searchQuery = '')}>Clear search</button>
      </div>
    {:else}
      {#each filtered as entry}
        <button class="entry-card" onclick={() => onDateSelect(entry.date)}>
          <div class="entry-meta">
            <span class="entry-date">{formatDate(entry.date)}</span>
            <span class="badge {entry.status === 'finished' ? 'badge-finished' : 'badge-draft'}">
              {entry.status}
            </span>
          </div>
          <div class="entry-hours">
            <span class="entry-hours-label">Rendered hours</span>
            <span class="entry-hours-value">{formatHoursAsHMS(entry.hours)}</span>
          </div>
          {#if entry.content_raw}
            <p class="entry-preview">
              {entry.content_raw.slice(0, 160)}{entry.content_raw.length > 160 ? '...' : ''}
            </p>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .journal-view {
    flex: 1;
    min-height: 0;
    max-width: 1080px;
    margin: 0 auto;
    padding: 2.75rem 2.5rem 4rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .journal-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
    gap: 1.25rem;
    align-items: end;
    padding: 1.5rem 1.7rem;
    border-radius: 24px;
    background:
      radial-gradient(circle at top left, rgba(190, 53, 25, 0.14), transparent 34%),
      linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(255, 251, 232, 0.96));
    border: 1px solid rgba(190, 53, 25, 0.14);
    box-shadow: 0 18px 40px rgba(190, 53, 25, 0.08);
  }

  .eyebrow,
  .panel-kicker {
    display: inline-block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--red);
  }

  .journal-hero h2 {
    font-size: clamp(2.1rem, 4vw, 3rem);
    margin: 0.35rem 0 0.45rem;
  }

  .journal-subtitle {
    max-width: 40rem;
    color: var(--dark-soft);
    font-size: 1rem;
    line-height: 1.7;
  }

  .journal-hero-actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
  }

  .hero-new-entry {
    grid-column: 1 / -1;
    justify-content: center;
    min-height: 48px;
  }

  .hero-month-input,
  .export-select,
  .summary-select,
  .search-input {
    width: 100%;
    min-height: 48px;
    padding: 0.8rem 1rem;
    border: 1px solid rgba(190, 53, 25, 0.16);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.88);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  }

  .hero-month-input:focus,
  .export-select:focus,
  .summary-select:focus,
  .search-input:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 4px rgba(190, 53, 25, 0.12);
  }

  .nav-chip {
    min-height: 48px;
    padding: 0 1rem;
    border: 1px solid rgba(190, 53, 25, 0.16);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.82);
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: transform var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
  }

  .nav-chip:hover {
    transform: translateY(-1px);
    border-color: var(--red);
    color: var(--red);
    background: white;
  }

  .overview-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }

  .overview-card {
    padding: 1.1rem 1.2rem;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(190, 53, 25, 0.12);
    box-shadow: 0 10px 24px rgba(34, 24, 8, 0.05);
  }

  .overview-label {
    display: inline-block;
    margin-bottom: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .overview-card strong {
    display: block;
    font-family: var(--font-display);
    font-size: 1.45rem;
    color: var(--red);
  }

  .overview-card p {
    margin-top: 0.2rem;
    color: var(--dark-soft);
    font-size: 0.88rem;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.82fr) minmax(0, 1.18fr);
    gap: 1rem;
    align-items: stretch;
  }

  .glass-card {
    border-radius: 22px;
    border: 1px solid rgba(190, 53, 25, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 253, 245, 0.82));
    box-shadow: 0 16px 32px rgba(34, 24, 8, 0.06);
    backdrop-filter: blur(10px);
  }

  .journal-controls,
  .summary-panel {
    padding: 1.35rem 1.4rem;
  }

  .panel-header,
  .summary-topline {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .panel-header h3,
  .summary-topline h3 {
    font-size: 1.5rem;
    margin-top: 0.35rem;
  }

  .panel-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(180px, auto);
    gap: 0.9rem;
    margin-top: 1rem;
  }

  .control-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .action-block {
    justify-content: flex-end;
  }

  .action-button {
    min-height: 48px;
    justify-content: center;
    width: 100%;
  }

  .control-hint,
  .summary-caption,
  .summary-footnote,
  .summary-warning {
    font-family: var(--font-ui);
    font-size: 0.84rem;
    color: var(--dark-soft);
    line-height: 1.6;
  }

  .control-hint {
    margin-top: 1rem;
  }

  .period-toggle {
    display: inline-flex;
    gap: 0.2rem;
    padding: 0.22rem;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    border: 1px solid rgba(190, 53, 25, 0.1);
  }

  .period-toggle button {
    border: none;
    background: transparent;
    color: var(--dark-soft);
    border-radius: 999px;
    padding: 0.55rem 0.95rem;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }

  .period-toggle button:hover {
    color: var(--red);
    transform: translateY(-1px);
  }

  .period-toggle button.active {
    background: linear-gradient(135deg, var(--red), var(--red-hover));
    color: var(--bg);
    box-shadow: 0 8px 18px rgba(190, 53, 25, 0.2);
  }

  .summary-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, auto);
    gap: 0.9rem;
    align-items: center;
    margin-top: 1rem;
  }

  .summary-range-chip {
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding: 0.8rem 1rem;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px dashed rgba(190, 53, 25, 0.18);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.95rem;
  }

  .summary-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .summary-stats span {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(190, 53, 25, 0.1);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    color: var(--dark-soft);
  }

  .summary-state,
  .summary-result {
    margin-top: 1rem;
    padding: 1.15rem 1.2rem;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(190, 53, 25, 0.1);
  }

  .summary-state strong,
  .summary-result-label {
    display: inline-block;
    margin-bottom: 0.45rem;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--red);
  }

  .summary-state p,
  .summary-result p {
    white-space: pre-wrap;
    line-height: 1.75;
    color: var(--dark);
  }

  .summary-state-error {
    background: rgba(190, 53, 25, 0.06);
    border-color: rgba(190, 53, 25, 0.18);
  }

  .summary-result-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .summary-save-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.7rem;
    border-radius: 999px;
    background: rgba(45, 122, 58, 0.12);
    color: var(--success);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .summary-save-pill.summary-live {
    background: rgba(184, 134, 11, 0.14);
    color: var(--warning);
  }

  .summary-footnote {
    margin-top: 0.8rem;
  }

  .summary-warning {
    margin-top: 0.65rem;
    color: var(--warning);
  }

  .search-shell {
    padding: 0.2rem 0;
  }

  .search-input {
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 12px 24px rgba(34, 24, 8, 0.04);
  }

  .entries-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding-bottom: 0.25rem;
  }

  .entry-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 1.4rem 1.45rem;
    border-radius: 20px;
    border: 1px solid rgba(190, 53, 25, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 252, 244, 0.86));
    box-shadow: 0 16px 30px rgba(34, 24, 8, 0.05);
    cursor: pointer;
    transition: transform 0.22s var(--ease-out), box-shadow 0.22s var(--ease-out), border-color 0.2s ease;
    font-family: inherit;
  }

  .entry-card:hover {
    transform: translateY(-3px);
    border-color: rgba(190, 53, 25, 0.26);
    box-shadow: 0 22px 40px rgba(190, 53, 25, 0.1);
  }

  .entry-card:active {
    transform: translateY(0);
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .entry-date {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--dark);
  }

  .entry-hours {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    margin-bottom: 0.55rem;
    font-family: var(--font-ui);
  }

  .entry-hours-label {
    color: var(--dark-soft);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .entry-hours-value {
    color: var(--red);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .entry-preview {
    font-size: 0.98rem;
    color: var(--dark-soft);
    line-height: 1.7;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
    color: var(--dark-soft);
    padding: 3rem 1.25rem;
    font-style: italic;
    font-size: 1rem;
  }

  .empty-icon {
    color: var(--border);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border);
    border-top-color: var(--red);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 980px) {
    .journal-view {
      padding: 2.25rem 1.75rem 3rem;
    }

    .journal-hero,
    .workspace-grid,
    .overview-strip {
      grid-template-columns: 1fr;
    }

    .journal-hero-actions {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
  }

  @media (max-width: 768px) {
    .journal-view {
      padding: 1.85rem 1.25rem 2.5rem;
    }

    .journal-hero {
      padding: 1.2rem;
    }

    .journal-hero-actions,
    .panel-body,
    .summary-controls {
      grid-template-columns: 1fr;
    }

    .journal-hero h2 {
      font-size: 2rem;
    }

    .period-toggle {
      width: 100%;
      justify-content: space-between;
    }

    .period-toggle button {
      flex: 1;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .journal-view {
      padding: 1.5rem 1rem 2rem;
    }

    .journal-hero-actions {
      grid-template-columns: 1fr 1fr;
    }

    .hero-month-input,
    .hero-new-entry {
      grid-column: 1 / -1;
    }

    .entry-card,
    .summary-panel,
    .journal-controls {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }
</style>
