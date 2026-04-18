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
  const PAGE_SIZE = 5;

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

  function formatSummaryPeriodLabel(period) {
    return period === 'week' ? 'week' : 'month';
  }

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getEntryPreview(entry, maxLength = 200) {
    const preview = [
      entry.content_ai_refined,
      entry.aras_summary,
      entry.content_raw,
      entry.aras_action
    ].find((value) => typeof value === 'string' && value.trim());

    if (!preview) return 'No written content yet.';

    const normalized = preview.trim().replace(/\s+/g, ' ');
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3).trimEnd()}...` : normalized;
  }

  function buildPageNumbers(totalPages, currentPage, maxVisible = 5) {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const halfWindow = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - halfWindow);
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  let lastFetchedSummaryKey = $state('');
  let lastAutoSummaryKey = $state('');
  let showSummaryModal = $state(false);
  let typedSummaryText = $state('');
  let summaryTypingActive = $state(false);
  let summaryModalCloseButton = $state(null);
  let summaryModalPreviousFocus = $state(null);
  let currentPage = $state(1);
  let expandedEntryDate = $state('');
  let summaryTypingTimer = null;

  let weekOptions = $derived.by(() => getWeekOptions($selectedMonth || monthValueFromDate()));
  let filteredEntries = $derived.by(() => {
    if (!searchQuery.trim()) return $journal.entries;
    const q = searchQuery.toLowerCase();
    return $journal.entries.filter((entry) =>
      (entry.content_raw || '').toLowerCase().includes(q) ||
      (entry.content_ai_refined || '').toLowerCase().includes(q) ||
      (entry.aras_summary || '').toLowerCase().includes(q) ||
      (entry.date || '').includes(q)
    );
  });
  let totalPages = $derived.by(() => Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE)));
  let paginatedEntries = $derived.by(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  });
  let visiblePageNumbers = $derived.by(() => buildPageNumbers(totalPages, currentPage));

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
  let activeSummaryKey = $derived.by(() =>
    activeSummaryRange ? `${summaryMode}:${activeSummaryRange.startDate}:${activeSummaryRange.endDate}` : ''
  );

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
    `${$selectedMonth}|${searchQuery.trim().toLowerCase()}`;
    currentPage = 1;
    expandedEntryDate = '';
  });

  $effect(() => {
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
  });

  $effect(() => {
    const range = activeSummaryRange;
    if (!range) {
      summaryResult = null;
      summaryError = '';
      summaryFetching = false;
      lastFetchedSummaryKey = '';
      return;
    }

    summaryResult = null;
    summaryError = '';
    summaryFetching = true;
    const requestId = ++summaryRequestId;
    const summaryKey = `${summaryMode}:${range.startDate}:${range.endDate}`;

    journal.fetchPeriodSummary(summaryMode, range.startDate, range.endDate)
      .then((saved) => {
        if (requestId !== summaryRequestId) return;
        lastFetchedSummaryKey = summaryKey;
        summaryResult = saved
          ? {
              ...saved,
              label: range.label
            }
          : null;
      })
      .catch(() => {
        if (requestId !== summaryRequestId) return;
        lastFetchedSummaryKey = summaryKey;
        summaryResult = null;
      })
      .finally(() => {
        if (requestId === summaryRequestId) {
          summaryFetching = false;
        }
      });
  });

  $effect(() => {
    const summaryKey = activeSummaryKey;
    if (!summaryKey || $journal.loading || summaryFetching || summaryLoading) return;
    if (lastFetchedSummaryKey !== summaryKey) return;
    if (summaryResult || summaryError || rangeContentCount === 0) return;
    if (lastAutoSummaryKey === summaryKey) return;

    lastAutoSummaryKey = summaryKey;
    handleGenerateSummary({ silent: true });
  });

  $effect(() => {
    activeSummaryKey;
    showSummaryModal = false;
    typedSummaryText = '';
    summaryTypingActive = false;
    if (summaryTypingTimer) {
      clearInterval(summaryTypingTimer);
      summaryTypingTimer = null;
    }
  });

  $effect(() => {
    if (!showSummaryModal || !summaryResult?.summary) {
      typedSummaryText = '';
      summaryTypingActive = false;
      if (summaryTypingTimer) {
        clearInterval(summaryTypingTimer);
        summaryTypingTimer = null;
      }
      return;
    }

    const fullText = summaryResult.summary;

    if (prefersReducedMotion()) {
      typedSummaryText = fullText;
      summaryTypingActive = false;
      return;
    }

    typedSummaryText = '';
    summaryTypingActive = true;
    let index = 0;
    const step = Math.max(2, Math.ceil(fullText.length / 110));

    summaryTypingTimer = setInterval(() => {
      index = Math.min(fullText.length, index + step);
      typedSummaryText = fullText.slice(0, index);

      if (index >= fullText.length) {
        summaryTypingActive = false;
        clearInterval(summaryTypingTimer);
        summaryTypingTimer = null;
      }
    }, 22);

    return () => {
      if (summaryTypingTimer) {
        clearInterval(summaryTypingTimer);
        summaryTypingTimer = null;
      }
    };
  });

  $effect(() => {
    if (!showSummaryModal || !summaryModalCloseButton) return;
    queueMicrotask(() => summaryModalCloseButton?.focus());
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

  async function handleGenerateSummary({ silent = false } = {}) {
    if (!activeSummaryRange) return;

    if (rangeContentCount === 0) {
      summaryError = `Add written journal content in this ${summaryMode} before generating a summary.`;
      if (!silent) {
        toast.error(summaryError);
      }
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

      if (!silent) {
        toast.success(`${summaryMode === 'week' ? 'Weekly' : 'Monthly'} summary ready`);
      }
    } catch (err) {
      summaryError = err.message || 'AI summary failed';
      if (!silent) {
        toast.error(summaryError);
      }
    } finally {
      summaryLoading = false;
    }
  }

  function openSummaryModal() {
    if (!summaryResult?.summary) return;
    summaryModalPreviousFocus = typeof document !== 'undefined' ? document.activeElement : null;
    typedSummaryText = prefersReducedMotion() ? summaryResult.summary : '';
    summaryTypingActive = !prefersReducedMotion();
    showSummaryModal = true;
  }

  function closeSummaryModal() {
    showSummaryModal = false;
    typedSummaryText = '';
    summaryTypingActive = false;
    if (summaryModalPreviousFocus && typeof summaryModalPreviousFocus.focus === 'function') {
      summaryModalPreviousFocus.focus();
    }
  }

  function handleSummaryOverlayClick(event) {
    if (event.target === event.currentTarget) {
      closeSummaryModal();
    }
  }

  function handleSummaryOverlayKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSummaryModal();
    }
  }

  function toggleEntry(entryDate) {
    expandedEntryDate = expandedEntryDate === entryDate ? '' : entryDate;
  }

  function goToPage(page) {
    currentPage = Math.min(totalPages, Math.max(1, page));
    expandedEntryDate = '';
  }
</script>

<div class="journal-view" aria-busy={$journal.loading || summaryLoading}>
  <section class="journal-hero animate-rise rise-1">
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

  <section class="overview-strip animate-rise rise-2">
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

  <section class="workspace-grid animate-rise rise-3">
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

    <div class="summary-panel card glass-card" aria-live="polite">
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
          <div class="summary-skeleton" aria-hidden="true">
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line long"></div>
            <div class="skeleton-line long"></div>
          </div>
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
          <p class="summary-ready-copy">
            Your {formatSummaryPeriodLabel(summaryResult.period)} summary is ready. Open it when you want the full readout.
          </p>
          <button
            type="button"
            class="btn btn-sm btn-primary summary-open-button"
            onclick={openSummaryModal}
            aria-haspopup="dialog"
          >
            See summarized {formatSummaryPeriodLabel(summaryResult.period)}
          </button>
          <p class="summary-footnote">
            Updated {new Date(summaryResult.updated_at || toDateString(new Date())).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })} | {summaryResult.entry_count} entr{summaryResult.entry_count === 1 ? 'y' : 'ies'} | {formatHoursValue(summaryResult.total_hours)} hours
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

  <div class="search-shell animate-rise rise-4">
    <input
      class="input search-input"
      type="text"
      placeholder="Search entries by content or date..."
      bind:value={searchQuery}
      aria-label="Search journal entries"
    />
  </div>

  <section class="entries-shell card glass-card animate-rise rise-5" aria-live="polite">
    <div class="entries-toolbar">
      <div>
        <h3>Entries</h3>
        <p class="entries-summary">
          {$journal.entries.length} total in {formatMonthLabel($selectedMonth)}
          {#if !$journal.loading && filteredEntries.length > 0}
            | Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length}
          {/if}
        </p>
      </div>

      {#if !$journal.loading && filteredEntries.length > 0}
        <span class="entries-page-indicator">Page {currentPage} of {totalPages}</span>
      {/if}
    </div>

    <div class="entries-list">
      {#if $journal.loading}
        <div class="entries-skeleton" aria-hidden="true">
          {#each Array.from({ length: PAGE_SIZE }) as _, index}
            <div class="entry-skeleton-card" style={`animation-delay: ${index * 40}ms;`}>
              <div class="entry-skeleton-top">
                <div class="skeleton-line short"></div>
                <div class="skeleton-chip" style="width: 4.5rem; height: 1.2rem;"></div>
              </div>
              <div class="skeleton-line long"></div>
              <div class="skeleton-line medium"></div>
            </div>
          {/each}
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
      {:else if filteredEntries.length === 0}
        <div class="empty-state">
          <p>No entries match "{searchQuery}" in {formatMonthLabel($selectedMonth)}.</p>
          <button class="btn btn-sm" onclick={() => (searchQuery = '')}>Clear search</button>
        </div>
      {:else}
        <div class="accordion-list">
          {#each paginatedEntries as entry}
            <article class:open={expandedEntryDate === entry.date} class="entry-accordion">
              <button
                type="button"
                class="entry-trigger"
                aria-expanded={expandedEntryDate === entry.date}
                aria-controls={`journal-entry-${entry.date}`}
                onclick={() => toggleEntry(entry.date)}
              >
                <div class="entry-trigger-main">
                  <div class="entry-meta">
                    <span class="entry-date">{formatDate(entry.date)}</span>
                    <span class="badge {entry.status === 'finished' ? 'badge-finished' : 'badge-draft'}">
                      {entry.status}
                    </span>
                  </div>
                  <p class="entry-preview">{getEntryPreview(entry)}</p>
                </div>

                <div class="entry-side">
                  <div class="entry-hours">
                    <span class="entry-hours-label">Hours</span>
                    <span class="entry-hours-value">{formatHoursAsHMS(entry.hours)}</span>
                  </div>
                  <span class="entry-expand-icon" aria-hidden="true">
                    {expandedEntryDate === entry.date ? 'Hide' : 'Open'}
                  </span>
                </div>
              </button>

              {#if expandedEntryDate === entry.date}
                <div class="entry-panel" id={`journal-entry-${entry.date}`}>
                  <div class="entry-detail-grid">
                    {#if entry.content_raw}
                      <section class="entry-detail-block">
                        <span class="entry-detail-label">Raw journal</span>
                        <p>{entry.content_raw}</p>
                      </section>
                    {/if}

                    {#if entry.content_ai_refined}
                      <section class="entry-detail-block">
                        <span class="entry-detail-label">AI refined</span>
                        <p>{entry.content_ai_refined}</p>
                      </section>
                    {/if}
                  </div>

                  {#if entry.aras_action || entry.aras_reflection || entry.aras_analysis || entry.aras_summary}
                    <div class="entry-aras-grid">
                      {#if entry.aras_action}
                        <section class="entry-aras-card">
                          <span class="entry-detail-label">Action</span>
                          <p>{entry.aras_action}</p>
                        </section>
                      {/if}
                      {#if entry.aras_reflection}
                        <section class="entry-aras-card">
                          <span class="entry-detail-label">Reflection</span>
                          <p>{entry.aras_reflection}</p>
                        </section>
                      {/if}
                      {#if entry.aras_analysis}
                        <section class="entry-aras-card">
                          <span class="entry-detail-label">Analysis</span>
                          <p>{entry.aras_analysis}</p>
                        </section>
                      {/if}
                      {#if entry.aras_summary}
                        <section class="entry-aras-card">
                          <span class="entry-detail-label">Summary</span>
                          <p>{entry.aras_summary}</p>
                        </section>
                      {/if}
                    </div>
                  {/if}

                  <div class="entry-panel-actions">
                    <button class="btn btn-sm btn-primary" onclick={() => onDateSelect(entry.date)}>
                      Open full entry
                    </button>
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        </div>

        {#if totalPages > 1}
          <nav class="pagination" aria-label="Journal entry pages">
            <button
              type="button"
              class="pagination-button"
              onclick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </button>

            <div class="pagination-numbers">
              {#each visiblePageNumbers as page}
                <button
                  type="button"
                  class:active={page === currentPage}
                  class="pagination-button pagination-number"
                  onclick={() => goToPage(page)}
                  aria-current={page === currentPage ? 'page' : undefined}
                >
                  {page}
                </button>
              {/each}
            </div>

            <button
              type="button"
              class="pagination-button"
              onclick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </nav>
        {/if}
      {/if}
    </div>
  </section>
</div>

{#if showSummaryModal && summaryResult}
  <div
    class="modal-overlay summary-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="summary-modal-title"
    aria-describedby="summary-modal-copy"
    tabindex="-1"
    onclick={handleSummaryOverlayClick}
    onkeydown={handleSummaryOverlayKeydown}
  >
    <div class="modal-content summary-modal">
      <div class="summary-modal-header">
        <div>
          <span class="summary-modal-kicker">{summaryResult.label}</span>
          <h3 id="summary-modal-title">Summarized {formatSummaryPeriodLabel(summaryResult.period)}</h3>
        </div>
        <button
          type="button"
          class="close-btn summary-modal-close"
          bind:this={summaryModalCloseButton}
          onclick={closeSummaryModal}
          aria-label="Close summarized entry modal"
        >
          &times;
        </button>
      </div>

      <div class="summary-modal-meta">
        <span>{summaryResult.entry_count} entr{summaryResult.entry_count === 1 ? 'y' : 'ies'}</span>
        <span>{formatHoursValue(summaryResult.total_hours)} hours</span>
        <span>{summaryResult.persisted === false ? 'Live only' : 'Saved'}</span>
      </div>

      <div class="summary-modal-body">
        <p
          id="summary-modal-copy"
          class:typing={summaryTypingActive}
          class="summary-modal-copy"
        >
          {summaryTypingActive ? typedSummaryText : typedSummaryText || summaryResult.summary}
        </p>
      </div>

      <div class="summary-modal-footer">
        <span class="summary-footnote">
          Updated {new Date(summaryResult.updated_at || toDateString(new Date())).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </span>
        <button type="button" class="btn btn-sm" onclick={closeSummaryModal}>
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

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
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(190, 53, 25, 0.14);
    box-shadow: 0 14px 28px rgba(34, 24, 8, 0.05);
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

  .summary-result {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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

  .summary-ready-copy {
    margin: 0;
  }

  .summary-skeleton {
    display: grid;
    gap: 0.55rem;
    margin: 0.85rem 0 0.75rem;
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

  .summary-open-button {
    align-self: flex-start;
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

  .summary-modal {
    max-width: 760px;
    background: #fffef8;
  }

  .summary-modal-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .summary-modal-kicker {
    display: inline-block;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 0.4rem;
  }

  .summary-modal-header h3 {
    margin: 0;
    font-size: 1.6rem;
  }

  .summary-modal-close {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border: none;
    border-radius: 999px;
    background: rgba(190, 53, 25, 0.08);
    color: var(--red);
    font-size: 1.4rem;
    line-height: 1;
    transition: background var(--transition-fast), transform var(--transition-fast), color var(--transition-fast);
  }

  .summary-modal-close:hover {
    background: rgba(190, 53, 25, 0.14);
    color: var(--red-hover);
    transform: translateY(-1px);
  }

  .summary-modal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1rem;
  }

  .summary-modal-meta span {
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(190, 53, 25, 0.12);
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--dark-soft);
  }

  .summary-modal-body {
    margin-top: 1rem;
    padding: 1.15rem 1.2rem;
    border-radius: 16px;
    border: 1px solid rgba(190, 53, 25, 0.12);
    background: rgba(255, 255, 255, 0.84);
    min-height: 14rem;
    max-height: min(60vh, 34rem);
    overflow: auto;
  }

  .summary-modal-copy {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.9;
    color: var(--dark);
  }

  .summary-modal-copy.typing::after {
    content: '|';
    margin-left: 0.08em;
    color: var(--red);
    animation: summaryCursorBlink 0.9s steps(1, end) infinite;
  }

  .summary-modal-footer {
    margin-top: 1rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }

  @keyframes summaryCursorBlink {
    0%, 49% {
      opacity: 1;
    }
    50%, 100% {
      opacity: 0;
    }
  }

  .search-shell {
    padding: 0.2rem 0;
  }

  .search-input {
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 12px 24px rgba(34, 24, 8, 0.04);
  }

  .entries-shell {
    padding: 1.35rem 1.4rem;
  }

  .entries-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .entries-toolbar h3 {
    margin: 0;
    font-size: 1.35rem;
  }

  .entries-summary,
  .entries-page-indicator {
    margin-top: 0.35rem;
    font-family: var(--font-ui);
    font-size: 0.84rem;
    color: var(--dark-soft);
  }

  .entries-page-indicator {
    padding: 0.4rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(190, 53, 25, 0.12);
    background: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
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

  .entries-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .entry-skeleton-card {
    display: grid;
    gap: 0.75rem;
    padding: 1.15rem 1.2rem;
    border-radius: 18px;
    border: 1px solid rgba(190, 53, 25, 0.1);
    background: rgba(255, 255, 255, 0.84);
    animation: skeletonLift 0.45s var(--ease-out) both;
  }

  .entry-skeleton-top {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }

  @keyframes skeletonLift {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .accordion-list {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .entry-accordion {
    border: 1px solid rgba(190, 53, 25, 0.12);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.88);
    overflow: hidden;
  }

  .entry-accordion.open {
    border-color: rgba(190, 53, 25, 0.22);
    box-shadow: 0 14px 28px rgba(34, 24, 8, 0.06);
  }

  .entry-trigger {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    text-align: left;
    padding: 1.15rem 1.2rem;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
  }

  .entry-trigger:hover {
    background: rgba(255, 247, 240, 0.72);
  }

  .entry-trigger-main {
    min-width: 0;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .entry-date {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--dark);
  }

  .entry-hours {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
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

  .entry-side {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .entry-expand-icon {
    min-width: 3rem;
    text-align: right;
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--red);
  }

  .entry-preview {
    margin: 0;
    font-size: 0.98rem;
    color: var(--dark-soft);
    line-height: 1.65;
  }

  .entry-panel {
    border-top: 1px solid rgba(190, 53, 25, 0.12);
    padding: 1.15rem 1.2rem 1.2rem;
    background: rgba(255, 252, 247, 0.72);
  }

  .entry-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .entry-detail-block,
  .entry-aras-card {
    padding: 0.95rem 1rem;
    border: 1px solid rgba(190, 53, 25, 0.1);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.85);
  }

  .entry-detail-block p,
  .entry-aras-card p {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.7;
    color: var(--dark);
  }

  .entry-detail-label {
    display: inline-block;
    margin-bottom: 0.55rem;
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .entry-aras-grid {
    margin-top: 0.9rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .entry-panel-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding-top: 0.4rem;
  }

  .pagination-numbers {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination-button {
    min-height: 40px;
    padding: 0.55rem 0.9rem;
    border-radius: 12px;
    border: 1px solid rgba(190, 53, 25, 0.14);
    background: rgba(255, 255, 255, 0.84);
    color: var(--dark);
    font-family: var(--font-ui);
    font-size: 0.86rem;
    font-weight: 600;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .pagination-button:hover:not(:disabled) {
    border-color: rgba(190, 53, 25, 0.34);
    background: white;
  }

  .pagination-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .pagination-button.active {
    border-color: var(--red);
    background: var(--red);
    color: var(--bg);
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

    .entries-toolbar,
    .pagination {
      flex-direction: column;
      align-items: stretch;
    }

    .entry-trigger {
      grid-template-columns: 1fr;
    }

    .entry-side {
      justify-content: space-between;
    }

    .entry-hours {
      align-items: flex-start;
    }

    .entry-detail-grid,
    .entry-aras-grid {
      grid-template-columns: 1fr;
    }

    .summary-modal-header,
    .summary-modal-footer {
      flex-direction: column;
      align-items: stretch;
    }

    .summary-open-button,
    .summary-modal-footer .btn {
      width: 100%;
      justify-content: center;
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

    .entries-shell,
    .summary-panel,
    .journal-controls {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .summary-modal-body {
      min-height: 12rem;
      padding: 1rem;
    }
  }
</style>
