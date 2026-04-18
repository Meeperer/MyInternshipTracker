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
        label: `Week ${index} · ${formatRangeLabel(weekStart, weekEnd)}`,
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
  <div class="journal-header">
    <div>
      <h2>Journal Entries</h2>
      <p class="journal-subtitle">Review one month at a time, export it cleanly, and generate AI summaries for weekly or monthly ranges.</p>
    </div>
    <button class="btn btn-sm btn-primary" onclick={openNewEntryForToday}>
      New Entry
    </button>
  </div>

  <div class="journal-controls card">
    <div class="control-block">
      <label class="label" for="journal-month">Selected Month</label>
      <input
        id="journal-month"
        class="month-input"
        type="month"
        bind:value={$selectedMonth}
        aria-label="Select journal month"
      />
      <p class="control-hint">
        {formatMonthLabel($selectedMonth)} · {$journal.entries.length} entr{$journal.entries.length === 1 ? 'y' : 'ies'} · {formatHoursValue(monthHours)} hours
      </p>
    </div>

    <div class="control-block">
      <label class="label" for="journal-export-format">Export Selected Month</label>
      <div class="export-group">
        <select id="journal-export-format" class="export-select" bind:value={exportFormat} aria-label="Export format">
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>
        <button
          class="btn btn-sm"
          onclick={handleExportMonth}
          disabled={exportLoading || $journal.loading}
          title="Download all entries from the selected month"
        >
          {exportLoading ? 'Exporting...' : 'Export Month'}
        </button>
      </div>
    </div>
  </div>

  <div class="summary-panel card">
    <div class="summary-header">
      <div>
        <h3>AI Period Summary</h3>
        <p class="summary-caption">Summarize the selected month, or switch to a week inside that month.</p>
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
        class="btn btn-sm btn-primary"
        onclick={handleGenerateSummary}
        disabled={$journal.loading || summaryLoading || rangeContentCount === 0}
      >
        {summaryLoading ? 'Summarizing...' : summaryMode === 'week' ? 'Summarize Week' : 'Summarize Month'}
      </button>
    </div>

    {#if activeSummaryRange}
      <p class="summary-meta">
        {activeSummaryRange.label} · {rangeEntries.length} entr{rangeEntries.length === 1 ? 'y' : 'ies'} · {formatHoursValue(rangeHours)} hours · {rangeContentCount} with journal content
      </p>
    {/if}

    {#if summaryError}
      <p class="field-error summary-feedback" role="alert">{summaryError}</p>
    {:else if summaryFetching}
      <div class="summary-empty">
        <p>Loading any saved {summaryMode} summary for this range...</p>
      </div>
    {:else if summaryResult}
      <div class="summary-result">
        <span class="summary-result-label">{summaryResult.label}</span>
        <p>{summaryResult.summary}</p>
        <p class="summary-footnote">
          Saved {new Date(summaryResult.updated_at || toDateString(new Date())).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })} · {summaryResult.entry_count} entr{summaryResult.entry_count === 1 ? 'y' : 'ies'} · {formatHoursValue(summaryResult.total_hours)} hours
        </p>
      </div>
    {:else}
      <div class="summary-empty">
        <p>
          {rangeContentCount > 0
            ? `Generate a ${summaryMode} summary to get a concise readout of your progress, themes, and next priorities.`
            : `This ${summaryMode} does not have enough written journal content yet for AI summarization.`}
        </p>
      </div>
    {/if}
  </div>

  <div class="search-bar">
    <input
      class="input"
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
      <div class="empty-state">
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
      <div class="empty-state">
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
              {entry.content_raw.slice(0, 120)}{entry.content_raw.length > 120 ? '...' : ''}
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
    max-width: 960px;
    margin: 0 auto;
    padding: 3rem 2.5rem 4rem;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .journal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .journal-header h2 {
    font-size: 2.25rem;
    margin-bottom: 0.35rem;
  }

  .journal-subtitle {
    max-width: 46rem;
    color: var(--dark-soft);
    font-size: 0.98rem;
    line-height: 1.6;
  }

  .journal-controls,
  .summary-panel {
    margin-bottom: 1.25rem;
    padding: 1.35rem 1.4rem;
  }

  .journal-controls {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    gap: 1rem;
    align-items: end;
  }

  .control-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .month-input,
  .export-select,
  .summary-select {
    width: 100%;
    min-height: 44px;
    padding: 0.7rem 0.9rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-ui);
    font-size: 0.88rem;
    background: white;
    color: var(--dark);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .month-input:focus,
  .export-select:focus,
  .summary-select:focus {
    outline: none;
    border-color: var(--red);
    box-shadow: 0 0 0 3px rgba(190, 53, 25, 0.12);
  }

  .control-hint,
  .summary-caption,
  .summary-meta,
  .summary-footnote {
    color: var(--dark-soft);
    font-family: var(--font-ui);
    line-height: 1.55;
  }

  .control-hint,
  .summary-caption,
  .summary-meta,
  .summary-footnote {
    font-size: 0.8rem;
  }

  .export-group {
    display: flex;
    gap: 0.65rem;
    align-items: center;
  }

  .export-group .btn {
    min-height: 44px;
    justify-content: center;
    white-space: nowrap;
  }

  .summary-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .summary-header h3 {
    font-size: 1.35rem;
    margin-bottom: 0.2rem;
  }

  .period-toggle {
    display: inline-flex;
    padding: 0.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .period-toggle button {
    border: none;
    background: transparent;
    color: var(--dark-soft);
    border-radius: 999px;
    padding: 0.5rem 0.85rem;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: background var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
  }

  .period-toggle button:hover {
    color: var(--red);
    transform: translateY(-1px);
  }

  .period-toggle button.active {
    background: var(--red);
    color: var(--bg);
    box-shadow: 0 6px 14px rgba(190, 53, 25, 0.18);
  }

  .summary-controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .summary-controls .btn {
    min-height: 44px;
    justify-content: center;
    white-space: nowrap;
  }

  .summary-range-chip {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0.7rem 0.95rem;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.8);
    border: 1px dashed var(--border);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.88rem;
  }

  .summary-meta {
    margin-top: 0.8rem;
  }

  .summary-feedback {
    margin-top: 0.8rem;
  }

  .summary-result,
  .summary-empty {
    margin-top: 1rem;
    padding: 1rem 1.1rem;
    border-radius: var(--radius-lg);
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid var(--border-light);
  }

  .summary-result-label {
    display: inline-block;
    margin-bottom: 0.55rem;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--red);
  }

  .summary-result p,
  .summary-empty p {
    white-space: pre-wrap;
    line-height: 1.7;
    color: var(--dark);
  }

  .summary-footnote {
    margin-top: 0.8rem;
  }

  .search-bar {
    margin: 0.1rem 0 1.5rem;
  }

  .search-bar .input {
    padding: 0.9rem 1.2rem;
    font-size: 1.05rem;
  }

  .entries-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .entry-card {
    display: block;
    width: 100%;
    text-align: left;
    background: white;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 1.35rem 1.5rem;
    cursor: pointer;
    transition: transform 0.22s var(--ease-out), box-shadow 0.22s var(--ease-out),
      border-color 0.2s ease, background 0.2s ease;
    font-family: inherit;
  }

  .entry-card:hover {
    border-color: var(--red);
    box-shadow: 0 6px 20px rgba(190, 53, 25, 0.12);
    transform: translateY(-2px);
  }

  .entry-card:active {
    transform: translateY(0);
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.4rem;
  }

  .entry-date {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--dark);
  }

  .entry-hours {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .entry-hours-label {
    color: var(--dark-soft);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .entry-hours-value {
    color: var(--red);
    font-weight: 600;
  }

  .entry-preview {
    font-size: 1rem;
    color: var(--dark-soft);
    line-height: 1.6;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
    color: var(--dark-soft);
    padding: 4rem 0;
    font-style: italic;
    font-size: 1.05rem;
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

  @media (max-width: 992px) {
    .journal-view {
      padding: 2.5rem 2rem 3rem;
    }

    .journal-header h2 {
      font-size: 2rem;
    }

    .journal-controls {
      grid-template-columns: 1fr;
    }

    .entry-card {
      padding: 1.2rem 1.35rem;
    }

    .entry-date,
    .entry-hours {
      font-size: 0.9rem;
    }

    .entry-preview {
      font-size: 0.95rem;
    }
  }

  @media (max-width: 768px) {
    .journal-view {
      padding: 2rem 1.5rem 2.5rem;
    }

    .journal-header {
      flex-direction: column;
      align-items: stretch;
      margin-bottom: 1.25rem;
    }

    .journal-header h2 {
      font-size: 1.75rem;
    }

    .summary-header,
    .summary-controls,
    .export-group {
      flex-direction: column;
      align-items: stretch;
    }

    .period-toggle {
      align-self: flex-start;
    }

    .summary-controls .btn,
    .export-group .btn {
      width: 100%;
    }

    .search-bar {
      margin-bottom: 1.25rem;
    }

    .search-bar .input {
      padding: 0.8rem 1rem;
      font-size: 1rem;
    }

    .entries-list {
      gap: 0.85rem;
    }

    .entry-card {
      padding: 1.1rem 1.25rem;
    }
  }

  @media (max-width: 480px) {
    .journal-view {
      padding: 1.5rem 1rem 2rem;
    }

    .journal-header h2 {
      font-size: 1.5rem;
    }

    .journal-subtitle {
      font-size: 0.92rem;
    }

    .journal-controls,
    .summary-panel {
      padding: 1rem;
    }

    .period-toggle {
      width: 100%;
    }

    .period-toggle button {
      flex: 1;
      justify-content: center;
    }

    .entry-card {
      padding: 1rem 1.1rem;
    }

    .entry-date {
      font-size: 0.85rem;
    }

    .entry-preview {
      font-size: 0.9rem;
    }

    .empty-state {
      padding: 3rem 0;
      font-size: 0.95rem;
    }
  }
</style>
