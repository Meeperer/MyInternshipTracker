<script>
  import { tick } from 'svelte';
  import {
    CalendarBlank,
    CaretLeft,
    CaretRight,
    DownloadSimple,
    MagnifyingGlass,
    Notebook,
    PencilSimpleLine,
    Sparkle
  } from 'phosphor-svelte';
  import { appCommands } from '$stores/appCommands.js';
  import { journal } from '$stores/journal.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { toast } from '$stores/toast.js';
  import {
    formatDate,
    formatDateLong,
    getMonthRange,
    monthValueFromDate,
    parseMonthValue,
    shiftDate,
    todayString
  } from '$utils/date.js';

  let { onDateSelect = () => {} } = $props();

  const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  });

  const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  });

  let searchOpen = $state(false);
  let summaryOpen = $state(false);
  let exportOpen = $state(false);
  let libraryOpen = $state(false);
  let detailEntry = $state(null);
  let searchQuery = $state('');
  let summaryMode = $state('month');
  let selectedWeekKey = $state('');
  let summaryLoading = $state(false);
  let summaryFetching = $state(false);
  let summaryResult = $state(null);
  let summaryError = $state('');
  let summaryRequestId = 0;
  let exportFormat = $state('markdown');
  let searchInputEl = $state(null);
  let previousFocus = $state(null);

  const today = todayString();

  function formatMonthLabel(monthValue) {
    const { year, month } = parseMonthValue(monthValue);
    return MONTH_LABEL_FORMATTER.format(new Date(year, (month || 1) - 1, 1));
  }

  function formatShortDate(dateStr) {
    return SHORT_DATE_FORMATTER.format(new Date(`${dateStr}T00:00:00`));
  }

  function formatHoursValue(hours) {
    const normalized = Number(hours) || 0;
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  }

  function formatEntryTitle(entry) {
    return formatDate(entry.date).replace(/,\s\d{4}$/, '');
  }

  function getEntryText(entry) {
    return [
      entry.content_ai_refined,
      entry.aras_summary,
      entry.content_raw,
      entry.aras_action,
      entry.aras_reflection,
      entry.aras_analysis
    ]
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' ')
      .trim();
  }

  function getEntryPreview(entry, maxLength = 98) {
    const text = getEntryText(entry).replace(/\s+/g, ' ');
    if (!text) return 'No notes yet.';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
  }

  function getSummaryPreview(summary, maxLength = 120) {
    const text = String(summary?.summary || '').trim().replace(/\s+/g, ' ');
    if (!text) return 'No saved summary text.';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3).trimEnd()}...` : text;
  }

  function getSummaryLabel(summary) {
    if (!summary) return '';
    if (summary.label) return summary.label;
    if (summary.period === 'month') return formatMonthLabel(summary.start_date?.slice(0, 7));
    return `${formatShortDate(summary.start_date)} - ${formatShortDate(summary.end_date)}`;
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
        label: `Week ${index}`,
        range: `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`,
        startDate: weekStart,
        endDate: weekEnd
      });

      cursor = shiftDate(weekEnd, 1);
      index += 1;
    }

    return options;
  }

  function hasEntryContent(entry) {
    return getEntryText(entry).length >= 10;
  }

  function rememberFocus() {
    if (typeof document !== 'undefined') {
      previousFocus = document.activeElement;
    }
  }

  function restoreFocus() {
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function openSearch() {
    rememberFocus();
    searchOpen = true;
    tick().then(() => searchInputEl?.focus());
  }

  function openSummary() {
    rememberFocus();
    summaryOpen = true;
  }

  function openExport() {
    rememberFocus();
    exportOpen = true;
  }

  function openLibrary() {
    rememberFocus();
    libraryOpen = true;
    journal.fetchSummaryLibrary(36).catch(() => {
      toast.error('Could not load saved summaries.');
    });
  }

  function openEntryDetail(entry) {
    rememberFocus();
    detailEntry = entry;
  }

  function closeModals() {
    searchOpen = false;
    summaryOpen = false;
    exportOpen = false;
    libraryOpen = false;
    detailEntry = null;
    restoreFocus();
  }

  function handleWindowKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!searchOpen && !summaryOpen && !exportOpen && !libraryOpen && !detailEntry) return;
    event.preventDefault();
    closeModals();
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) closeModals();
  }

  function openEditor(date) {
    closeModals();
    onDateSelect(date);
  }

  function handleMonthInput(event) {
    if (event.currentTarget.value) selectedMonth.set(event.currentTarget.value);
  }

  async function handleGenerateSummary() {
    if (!activeSummaryRange || rangeContentCount === 0) {
      summaryError = 'Add a journal note before generating this range.';
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
      toast.success('Summary updated.');
    } catch (error) {
      summaryError = error?.message || 'Summary generation failed.';
      toast.error('Summary generation failed.');
    } finally {
      summaryLoading = false;
    }
  }

  async function togglePin(summary) {
    if (!summary?.id) return;
    try {
      await journal.toggleSummaryPin(summary.id, !summary.pinned);
    } catch {
      toast.error('Could not update summary.');
    }
  }

  function entriesToMarkdown(entries, monthValue) {
    const totalHours = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
    const lines = [
      '# Journal Export',
      `Month: ${formatMonthLabel(monthValue)}`,
      `Entries: ${entries.length}`,
      `Hours: ${formatHoursValue(totalHours)}h`,
      '',
      '---',
      ''
    ];

    if (!entries.length) {
      lines.push('No entries recorded.');
      return lines.join('\n');
    }

    for (const entry of entries) {
      lines.push(`## ${formatDateLong(entry.date)}`);
      lines.push(`Hours: ${formatHoursValue(entry.hours)}h`);
      lines.push(`Status: ${entry.status || 'draft'}`);
      lines.push('');
      lines.push(entry.content_raw || getEntryText(entry) || 'No notes.');
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  function downloadExport() {
    if (typeof document === 'undefined') return;

    const filenameBase = `journal-${$selectedMonth}`;
    const isJson = exportFormat === 'json';
    const content = isJson
      ? JSON.stringify(monthEntries, null, 2)
      : entriesToMarkdown(monthEntries, $selectedMonth);
    const blob = new Blob([content], {
      type: isJson ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${filenameBase}.${isJson ? 'json' : 'md'}`;
    link.click();

    URL.revokeObjectURL(url);
    toast.success('Export ready.');
    closeModals();
  }

  let monthEntries = $derived.by(() =>
    [...($journal.entries || [])].sort((a, b) => b.date.localeCompare(a.date))
  );

  let monthHours = $derived.by(() =>
    monthEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
  );

  let finishedCount = $derived.by(() =>
    monthEntries.filter((entry) => entry.status === 'finished').length
  );

  let activeDays = $derived.by(() => monthEntries.filter((entry) => Number(entry.hours) > 0).length);

  let averageActiveDay = $derived.by(() => (activeDays ? monthHours / activeDays : 0));

  let latestEntry = $derived.by(() => monthEntries[0] || null);

  let todayEntry = $derived.by(() => monthEntries.find((entry) => entry.date === today) || null);

  let searchResults = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return monthEntries.slice(0, 12);
    return monthEntries.filter((entry) =>
      [entry.date, entry.status, getEntryText(entry)]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  let weekOptions = $derived.by(() => getWeekOptions($selectedMonth || monthValueFromDate()));

  let selectedWeek = $derived.by(
    () => weekOptions.find((week) => week.key === selectedWeekKey) || weekOptions[0] || null
  );

  let activeSummaryRange = $derived.by(() => {
    if (!$selectedMonth) return null;
    if (summaryMode === 'week' && selectedWeek) {
      return {
        ...selectedWeek,
        label: `${selectedWeek.label}, ${selectedWeek.range}`
      };
    }

    return {
      key: $selectedMonth,
      label: formatMonthLabel($selectedMonth),
      ...getMonthRange($selectedMonth)
    };
  });

  let rangeEntries = $derived.by(() => {
    if (!activeSummaryRange) return [];
    return monthEntries.filter(
      (entry) => entry.date >= activeSummaryRange.startDate && entry.date <= activeSummaryRange.endDate
    );
  });

  let rangeHours = $derived.by(() =>
    rangeEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
  );

  let rangeContentCount = $derived.by(() => rangeEntries.filter(hasEntryContent).length);

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
    const command = $appCommands.pendingCommand;
    if (!command) return;

    if (command.type === 'open-journal-date' && command.date) {
      selectedMonth.set(command.date.slice(0, 7));
      onDateSelect(command.date);
      appCommands.consume(command.id);
      return;
    }

    if (command.type === 'focus-journal-search') {
      openSearch();
      appCommands.consume(command.id);
      return;
    }

    if (command.type === 'focus-summary-library') {
      openLibrary();
      appCommands.consume(command.id);
    }
  });

  $effect(() => {
    if (!summaryOpen || !activeSummaryRange) return;

    const requestId = ++summaryRequestId;
    summaryFetching = true;
    summaryError = '';

    journal
      .fetchPeriodSummary(summaryMode, activeSummaryRange.startDate, activeSummaryRange.endDate)
      .then((saved) => {
        if (requestId !== summaryRequestId) return;
        summaryResult = saved
          ? {
              ...saved,
              label: activeSummaryRange.label
            }
          : null;
      })
      .catch(() => {
        if (requestId !== summaryRequestId) return;
        summaryResult = null;
      })
      .finally(() => {
        if (requestId === summaryRequestId) summaryFetching = false;
      });
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section class="journal-page page-enter" aria-label="Journal workspace">
  <header class="journal-header">
    <div class="journal-title-block">
      <h1>Journal</h1>
      <p>{monthEntries.length} entries · {formatHoursValue(monthHours)}h logged</p>
    </div>

    <div class="journal-month-bar" aria-label="Month controls">
      <button class="icon-button" type="button" onclick={() => selectedMonth.shift(-1)} aria-label="Previous month">
        <CaretLeft size={17} weight="bold" />
      </button>
      <label class="month-field">
        <span>Month</span>
        <input type="month" value={$selectedMonth} onchange={handleMonthInput} />
      </label>
      <button class="icon-button" type="button" onclick={() => selectedMonth.shift(1)} aria-label="Next month">
        <CaretRight size={17} weight="bold" />
      </button>
      <button class="btn btn-primary write-button" type="button" onclick={() => openEditor(today)}>
        <PencilSimpleLine size={17} weight="bold" />
        Write
      </button>
    </div>
  </header>

  <section class="journal-strip" aria-label="Month status">
    <article class="journal-strip-cell is-primary">
      <span>Hours</span>
      <strong>{formatHoursValue(monthHours)}h</strong>
      <p>{formatHoursValue(averageActiveDay)}h avg active day</p>
    </article>
    <article class="journal-strip-cell">
      <span>Entries</span>
      <strong>{monthEntries.length}</strong>
      <p>{finishedCount} finished</p>
    </article>
    <article class="journal-strip-cell">
      <span>Today</span>
      <strong>{todayEntry ? `${formatHoursValue(todayEntry.hours)}h` : 'Open'}</strong>
      <p>{todayEntry ? todayEntry.status : 'No entry yet'}</p>
    </article>
    <article class="journal-strip-cell">
      <span>Latest</span>
      <strong>{latestEntry ? formatShortDate(latestEntry.date) : 'None'}</strong>
      <p>{latestEntry ? getEntryPreview(latestEntry, 38) : 'Start this month'}</p>
    </article>
  </section>

  <div class="journal-workspace">
    <section class="entries-panel" aria-label="Journal entries">
      <div class="panel-toolbar">
        <div>
          <h2>{formatMonthLabel($selectedMonth)}</h2>
          <p>{activeDays} active days</p>
        </div>
        <div class="toolbar-actions">
          <button class="ghost-action" type="button" onclick={openSearch}>
            <MagnifyingGlass size={16} weight="bold" />
            Find
          </button>
          <button class="ghost-action" type="button" onclick={openSummary}>
            <Sparkle size={16} weight="bold" />
            Summary
          </button>
          <button class="ghost-action" type="button" onclick={openExport}>
            <DownloadSimple size={16} weight="bold" />
            Export
          </button>
        </div>
      </div>

      {#if $journal.loading}
        <div class="entry-stack" aria-label="Loading entries">
          {#each Array.from({ length: 5 }) as _}
            <div class="entry-row is-loading">
              <span class="loading-date"></span>
              <span class="loading-copy"></span>
              <span class="loading-meta"></span>
            </div>
          {/each}
        </div>
      {:else if monthEntries.length === 0}
        <div class="empty-journal">
          <Notebook size={24} weight="bold" />
          <h2>No entries</h2>
          <p>This month is clear.</p>
          <button class="btn btn-primary" type="button" onclick={() => openEditor(today)}>
            <PencilSimpleLine size={17} weight="bold" />
            Write today
          </button>
        </div>
      {:else}
        <div class="entry-stack">
          {#each monthEntries as entry (entry.date)}
            <article class:today-row={entry.date === today} class="entry-row">
              <button class="entry-main" type="button" onclick={() => openEntryDetail(entry)}>
                <span class="entry-date">
                  <strong>{formatShortDate(entry.date)}</strong>
                  <em>{formatEntryTitle(entry)}</em>
                </span>
                <span class="entry-copy">{getEntryPreview(entry)}</span>
                <span class="entry-meta">
                  <span>{formatHoursValue(entry.hours)}h</span>
                  <span>{entry.status || 'draft'}</span>
                </span>
              </button>
              <button class="row-edit" type="button" onclick={() => openEditor(entry.date)} aria-label={`Edit ${formatDate(entry.date)}`}>
                <PencilSimpleLine size={16} weight="bold" />
              </button>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <aside class="journal-rail" aria-label="Journal actions">
      <section class="rail-card rail-today">
        <div>
          <span>Today</span>
          <strong>{formatDate(today).replace(/,\s\d{4}$/, '')}</strong>
        </div>
        <button class="btn btn-primary" type="button" onclick={() => openEditor(today)}>
          <PencilSimpleLine size={17} weight="bold" />
          Write
        </button>
      </section>

      <section class="rail-card">
        <span>Summary</span>
        <strong>{formatHoursValue(rangeHours)}h in range</strong>
        <p>{rangeContentCount} notes ready</p>
        <button class="compact-link" type="button" onclick={openSummary}>Open summary</button>
      </section>

      <section class="rail-card">
        <span>Library</span>
        <strong>{$journal.summaryLibrary.length || 'Saved'}</strong>
        <p>Past recaps stay out of the main page.</p>
        <button class="compact-link" type="button" onclick={openLibrary}>View library</button>
      </section>
    </aside>
  </div>
</section>

{#if detailEntry}
  <div class="journal-modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="journal-modal entry-modal" role="dialog" aria-modal="true" aria-labelledby="entry-detail-title">
      <div class="modal-header">
        <div>
          <span>{formatHoursValue(detailEntry.hours)}h · {detailEntry.status || 'draft'}</span>
          <h2 id="entry-detail-title">{formatDateLong(detailEntry.date)}</h2>
        </div>
        <button class="modal-close" type="button" onclick={closeModals} aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        {#if getEntryText(detailEntry)}
          <p class="entry-full-copy">{getEntryText(detailEntry)}</p>
        {:else}
          <p class="entry-full-copy is-empty">No note content yet.</p>
        {/if}
      </div>

      <footer class="modal-footer">
        <button class="btn" type="button" onclick={closeModals}>Close</button>
        <button class="btn btn-primary" type="button" onclick={() => openEditor(detailEntry.date)}>
          <PencilSimpleLine size={17} weight="bold" />
          Edit day
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if searchOpen}
  <div class="journal-modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-search-title">
      <div class="modal-header">
        <div>
          <span>Find entries</span>
          <h2 id="journal-search-title">Search</h2>
        </div>
        <button class="modal-close" type="button" onclick={closeModals} aria-label="Close">×</button>
      </div>

      <label class="search-field">
        <MagnifyingGlass size={16} weight="bold" />
        <input bind:this={searchInputEl} bind:value={searchQuery} type="search" placeholder="Date, status, notes" />
      </label>

      <div class="modal-list">
        {#each searchResults as entry (entry.date)}
          <button class="modal-list-row" type="button" onclick={() => openEntryDetail(entry)}>
            <span>{formatShortDate(entry.date)}</span>
            <strong>{getEntryPreview(entry, 72)}</strong>
            <em>{formatHoursValue(entry.hours)}h</em>
          </button>
        {:else}
          <p class="modal-empty">No matches.</p>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if summaryOpen}
  <div class="journal-modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="journal-modal summary-modal" role="dialog" aria-modal="true" aria-labelledby="journal-summary-title">
      <div class="modal-header">
        <div>
          <span>{activeSummaryRange?.label}</span>
          <h2 id="journal-summary-title">Summary</h2>
        </div>
        <button class="modal-close" type="button" onclick={closeModals} aria-label="Close">×</button>
      </div>

      <div class="summary-controls">
        <div class="segmented-control" aria-label="Summary period">
          <button type="button" class:active={summaryMode === 'month'} onclick={() => (summaryMode = 'month')}>Month</button>
          <button type="button" class:active={summaryMode === 'week'} onclick={() => (summaryMode = 'week')}>Week</button>
        </div>

        {#if summaryMode === 'week'}
          <select class="week-select" bind:value={selectedWeekKey} aria-label="Select week">
            {#each weekOptions as week}
              <option value={week.key}>{week.label} · {week.range}</option>
            {/each}
          </select>
        {/if}
      </div>

      <div class="summary-stats">
        <span><strong>{rangeEntries.length}</strong> entries</span>
        <span><strong>{formatHoursValue(rangeHours)}h</strong> logged</span>
        <span><strong>{rangeContentCount}</strong> notes</span>
      </div>

      <div class="summary-result">
        {#if summaryFetching}
          <p>Checking saved summary...</p>
        {:else if summaryResult?.summary}
          <p>{summaryResult.summary}</p>
        {:else}
          <p>No saved summary for this range.</p>
        {/if}
      </div>

      {#if summaryError}
        <p class="modal-error">{summaryError}</p>
      {/if}

      <footer class="modal-footer">
        <button class="btn" type="button" onclick={openLibrary}>Library</button>
        <button class="btn btn-primary" type="button" onclick={handleGenerateSummary} disabled={summaryLoading || summaryFetching}>
          <Sparkle size={17} weight="bold" />
          {summaryLoading ? 'Generating...' : 'Generate'}
        </button>
      </footer>
    </div>
  </div>
{/if}

{#if libraryOpen}
  <div class="journal-modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="journal-modal library-modal" role="dialog" aria-modal="true" aria-labelledby="summary-library-title">
      <div class="modal-header">
        <div>
          <span>{$journal.summaryLibrary.length} saved</span>
          <h2 id="summary-library-title">Library</h2>
        </div>
        <button class="modal-close" type="button" onclick={closeModals} aria-label="Close">×</button>
      </div>

      <div class="modal-list">
        {#if $journal.summaryLibraryLoading}
          <p class="modal-empty">Loading summaries...</p>
        {:else}
          {#each $journal.summaryLibrary as summary (summary.id)}
            <article class="library-row">
              <div>
                <span>{getSummaryLabel(summary)}</span>
                <strong>{getSummaryPreview(summary)}</strong>
              </div>
              <button class="pin-button" type="button" onclick={() => togglePin(summary)}>
                {summary.pinned ? 'Pinned' : 'Pin'}
              </button>
            </article>
          {:else}
            <p class="modal-empty">No saved summaries.</p>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if exportOpen}
  <div class="journal-modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="journal-modal export-modal" role="dialog" aria-modal="true" aria-labelledby="journal-export-title">
      <div class="modal-header">
        <div>
          <span>{monthEntries.length} entries</span>
          <h2 id="journal-export-title">Export</h2>
        </div>
        <button class="modal-close" type="button" onclick={closeModals} aria-label="Close">×</button>
      </div>

      <div class="export-options" role="radiogroup" aria-label="Export format">
        <label>
          <input type="radio" bind:group={exportFormat} value="markdown" />
          <span>Markdown</span>
        </label>
        <label>
          <input type="radio" bind:group={exportFormat} value="json" />
          <span>JSON</span>
        </label>
      </div>

      <footer class="modal-footer">
        <button class="btn" type="button" onclick={closeModals}>Cancel</button>
        <button class="btn btn-primary" type="button" onclick={downloadExport}>
          <DownloadSimple size={17} weight="bold" />
          Download
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .journal-page {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 2vw, 1.6rem);
  }

  .journal-header,
  .journal-strip,
  .entries-panel,
  .journal-rail,
  .journal-modal {
    border: 1px solid rgba(36, 24, 15, 0.74);
    background: rgba(250, 244, 218, 0.9);
    box-shadow: 3px 3px 0 rgba(36, 24, 15, 0.1);
  }

  .journal-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 1rem;
    padding: 1.1rem;
    min-height: 116px;
  }

  .journal-title-block h1 {
    margin: 0;
    color: var(--canopy);
    font-size: clamp(2.5rem, 6vw, 5.2rem);
    line-height: 0.86;
  }

  .journal-title-block p,
  .panel-toolbar p,
  .journal-strip-cell p,
  .rail-card p,
  .entry-copy,
  .entry-date em,
  .modal-empty,
  .modal-header span,
  .library-row span {
    color: rgba(36, 24, 15, 0.66);
  }

  .journal-title-block p {
    margin-top: 0.8rem;
    font-size: 0.92rem;
  }

  .journal-month-bar {
    display: flex;
    align-items: end;
    gap: 0.55rem;
  }

  .icon-button,
  .ghost-action,
  .row-edit,
  .modal-close,
  .compact-link,
  .pin-button {
    border: 1px solid rgba(36, 24, 15, 0.72);
    border-radius: 7px;
    background: var(--paper-strong);
    color: var(--canopy);
    transition:
      background 0.14s var(--ease-out),
      transform 0.14s var(--ease-out),
      box-shadow 0.14s var(--ease-out),
      border-color 0.14s var(--ease-out);
  }

  .icon-button {
    display: inline-grid;
    place-items: center;
    width: 2.7rem;
    height: 2.7rem;
  }

  .month-field {
    display: grid;
    gap: 0.25rem;
    min-width: min(18rem, 34vw);
  }

  .month-field span,
  .journal-strip-cell span,
  .rail-card span,
  .modal-header span {
    font-family: var(--font-ui);
    font-size: 0.74rem;
    font-weight: 800;
    color: var(--canopy);
  }

  .month-field input,
  .search-field input,
  .week-select {
    width: 100%;
    min-height: 2.7rem;
    border: 1px solid rgba(36, 24, 15, 0.72);
    border-radius: 7px;
    background: var(--paper-strong);
    color: var(--soil);
    font: inherit;
    font-weight: 700;
  }

  .month-field input,
  .week-select {
    padding: 0.65rem 0.75rem;
  }

  .write-button {
    min-height: 2.7rem;
    white-space: nowrap;
  }

  .journal-strip {
    display: grid;
    grid-template-columns: 1.15fr repeat(3, 1fr);
    overflow: hidden;
  }

  .journal-strip-cell {
    display: grid;
    align-content: start;
    gap: 0.42rem;
    min-height: 112px;
    padding: 1rem;
    border-left: 1px solid rgba(36, 24, 15, 0.18);
  }

  .journal-strip-cell:first-child {
    border-left: 0;
  }

  .journal-strip-cell.is-primary {
    background: var(--canopy);
    color: var(--cream);
  }

  .journal-strip-cell.is-primary span,
  .journal-strip-cell.is-primary strong,
  .journal-strip-cell.is-primary p {
    color: var(--cream);
  }

  .journal-strip-cell strong {
    color: var(--canopy);
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3.2vw, 3rem);
    line-height: 0.9;
  }

  .journal-strip-cell p {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .journal-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(230px, 280px);
    gap: 1rem;
    align-items: start;
  }

  .entries-panel,
  .journal-rail {
    padding: 1rem;
  }

  .panel-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
  }

  .panel-toolbar h2,
  .modal-header h2,
  .empty-journal h2 {
    margin: 0;
    color: var(--canopy);
    font-size: clamp(1.55rem, 2.5vw, 2.15rem);
  }

  .toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .ghost-action,
  .compact-link,
  .pin-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 2.3rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .entry-stack {
    display: grid;
  }

  .entry-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.35rem;
    align-items: stretch;
    min-height: 76px;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
  }

  .entry-row:last-child {
    border-bottom: 0;
  }

  .entry-row.today-row {
    background: rgba(11, 110, 58, 0.06);
  }

  .entry-main {
    display: grid;
    grid-template-columns: minmax(112px, 0.23fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 0.85rem 0.7rem 0.85rem 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .entry-date {
    display: grid;
    gap: 0.2rem;
  }

  .entry-date strong {
    color: var(--canopy);
    font-family: var(--font-display);
    font-size: 1.35rem;
    line-height: 0.95;
  }

  .entry-date em,
  .entry-copy,
  .entry-meta,
  .modal-list-row em {
    font-style: normal;
    font-size: 0.84rem;
  }

  .entry-copy {
    line-height: 1.45;
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    justify-content: flex-end;
    color: var(--canopy);
    font-weight: 800;
    white-space: nowrap;
  }

  .entry-meta span + span::before {
    content: '/';
    margin-right: 0.45rem;
    color: rgba(36, 24, 15, 0.34);
  }

  .row-edit {
    align-self: center;
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
  }

  .journal-rail {
    position: sticky;
    top: 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .rail-card {
    display: grid;
    gap: 0.45rem;
    padding: 0.9rem;
    border: 1px solid rgba(36, 24, 15, 0.14);
    background: rgba(255, 250, 226, 0.56);
  }

  .rail-card strong {
    color: var(--canopy);
    font-family: var(--font-display);
    font-size: 1.45rem;
    line-height: 1;
  }

  .rail-card p {
    margin: 0;
    font-size: 0.86rem;
  }

  .rail-today {
    background: var(--canopy);
  }

  .rail-today span,
  .rail-today strong {
    color: var(--cream);
  }

  .compact-link {
    justify-self: start;
    margin-top: 0.25rem;
  }

  .empty-journal {
    display: grid;
    place-items: center;
    gap: 0.65rem;
    min-height: 320px;
    color: var(--canopy);
    text-align: center;
  }

  .empty-journal p {
    margin: 0;
    color: rgba(36, 24, 15, 0.66);
  }

  .is-loading {
    grid-template-columns: 130px minmax(0, 1fr) 94px;
    gap: 1rem;
    padding: 1rem 0;
  }

  .loading-date,
  .loading-copy,
  .loading-meta {
    display: block;
    height: 1rem;
    border-radius: 4px;
    background: rgba(11, 110, 58, 0.12);
  }

  .loading-date {
    width: 96px;
  }

  .loading-copy {
    width: 100%;
  }

  .loading-meta {
    width: 72px;
  }

  .journal-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgba(8, 17, 11, 0.42);
    backdrop-filter: blur(2px);
  }

  .journal-modal {
    width: min(720px, 100%);
    max-height: min(760px, calc(100vh - 2rem));
    overflow: auto;
    padding: 1rem;
    animation: modal-in 0.16s var(--ease-out);
  }

  .entry-modal {
    width: min(820px, 100%);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.8rem;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
  }

  .modal-close {
    display: inline-grid;
    place-items: center;
    width: 2.35rem;
    height: 2.35rem;
    font-size: 1.35rem;
    line-height: 1;
  }

  .modal-body,
  .summary-result {
    padding: 1rem 0;
  }

  .entry-full-copy,
  .summary-result p {
    margin: 0;
    color: var(--soil);
    line-height: 1.75;
    white-space: pre-wrap;
  }

  .entry-full-copy.is-empty,
  .summary-result p {
    color: rgba(36, 24, 15, 0.72);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.65rem;
    padding-top: 0.9rem;
    border-top: 1px solid rgba(36, 24, 15, 0.12);
  }

  .search-field {
    position: relative;
    display: grid;
    margin: 1rem 0;
  }

  .search-field :global(svg) {
    position: absolute;
    left: 0.8rem;
    top: 50%;
    color: var(--canopy);
    transform: translateY(-50%);
  }

  .search-field input {
    padding: 0.7rem 0.8rem 0.7rem 2.35rem;
  }

  .modal-list {
    display: grid;
  }

  .modal-list-row,
  .library-row {
    display: grid;
    grid-template-columns: minmax(80px, 0.18fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.85rem;
    min-height: 64px;
    padding: 0.75rem 0;
    border: 0;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
    background: transparent;
    color: inherit;
    text-align: left;
  }

  .modal-list-row:last-child,
  .library-row:last-child {
    border-bottom: 0;
  }

  .modal-list-row span,
  .modal-list-row em {
    color: rgba(36, 24, 15, 0.68);
    font-weight: 800;
  }

  .modal-list-row strong,
  .library-row strong {
    color: var(--soil);
    font-weight: 600;
    line-height: 1.45;
  }

  .library-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .library-row > div {
    display: grid;
    gap: 0.25rem;
  }

  .pin-button {
    min-width: 4.5rem;
  }

  .modal-empty,
  .modal-error {
    margin: 1rem 0 0;
    font-size: 0.92rem;
  }

  .modal-error {
    color: var(--canopy);
    font-weight: 800;
  }

  .summary-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    align-items: center;
    padding: 1rem 0 0.7rem;
  }

  .segmented-control {
    display: inline-flex;
    border: 1px solid rgba(36, 24, 15, 0.72);
    border-radius: 7px;
    overflow: hidden;
  }

  .segmented-control button {
    min-height: 2.45rem;
    padding: 0.55rem 0.9rem;
    border: 0;
    border-left: 1px solid rgba(36, 24, 15, 0.18);
    background: var(--paper-strong);
    color: var(--canopy);
    font-weight: 800;
  }

  .segmented-control button:first-child {
    border-left: 0;
  }

  .segmented-control button.active {
    background: var(--canopy);
    color: var(--cream);
  }

  .week-select {
    width: min(260px, 100%);
  }

  .summary-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    border: 1px solid rgba(36, 24, 15, 0.14);
  }

  .summary-stats span {
    display: grid;
    gap: 0.2rem;
    padding: 0.75rem;
    border-left: 1px solid rgba(36, 24, 15, 0.14);
    color: rgba(36, 24, 15, 0.68);
    font-size: 0.83rem;
  }

  .summary-stats span:first-child {
    border-left: 0;
  }

  .summary-stats strong {
    color: var(--canopy);
    font-size: 1.1rem;
  }

  .summary-result {
    min-height: 124px;
  }

  .export-options {
    display: grid;
    gap: 0.65rem;
    padding: 1rem 0;
  }

  .export-options label {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 3rem;
    padding: 0.7rem;
    border: 1px solid rgba(36, 24, 15, 0.16);
    background: rgba(255, 250, 226, 0.54);
    color: var(--soil);
    font-weight: 800;
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .icon-button:hover,
    .ghost-action:hover,
    .row-edit:hover,
    .modal-close:hover,
    .compact-link:hover,
    .pin-button:hover {
      background: rgba(11, 110, 58, 0.08);
      border-color: rgba(36, 24, 15, 0.9);
      box-shadow: 2px 2px 0 rgba(36, 24, 15, 0.1);
      transform: translate(-1px, -1px);
    }

    .entry-main:hover,
    .modal-list-row:hover {
      background: rgba(11, 110, 58, 0.045);
    }
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.995);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 1050px) {
    .journal-header,
    .journal-workspace {
      grid-template-columns: 1fr;
    }

    .journal-month-bar {
      justify-content: flex-start;
    }

    .journal-rail {
      position: static;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .journal-page {
      padding: 0.85rem;
    }

    .journal-header {
      min-height: auto;
    }

    .toolbar-actions,
    .panel-toolbar,
    .modal-footer,
    .summary-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .journal-month-bar {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      align-items: end;
      gap: 0.5rem;
    }

    .month-field {
      min-width: 100%;
    }

    .icon-button {
      width: 44px;
      height: 44px;
    }

    .write-button {
      grid-column: 1 / -1;
    }

    .write-button,
    .toolbar-actions .ghost-action,
    .modal-footer .btn {
      width: 100%;
    }

    .journal-strip,
    .journal-rail,
    .summary-stats {
      grid-template-columns: 1fr;
    }

    .journal-strip-cell,
    .summary-stats span {
      border-left: 0;
      border-top: 1px solid rgba(36, 24, 15, 0.14);
    }

    .journal-strip-cell:first-child,
    .summary-stats span:first-child {
      border-top: 0;
    }

    .entry-main,
    .modal-list-row,
    .library-row {
      grid-template-columns: 1fr;
      gap: 0.35rem;
    }

    .entry-row {
      grid-template-columns: minmax(0, 1fr) 2.35rem;
      min-height: 104px;
      padding: 0.35rem 0;
    }

    .entry-main {
      align-content: center;
      padding-block: 0.75rem;
    }

    .entry-meta {
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .journal-modal {
      animation: none;
    }
  }

  /* Mobile workspace pass */
  @media (max-width: 760px) {
    .journal-page {
      gap: 0.7rem;
      padding: 0.65rem;
    }

    .journal-header,
    .journal-strip,
    .entries-panel,
    .journal-rail {
      box-shadow: 2px 2px 0 rgba(36, 24, 15, 0.1);
    }

    .journal-header {
      gap: 0.75rem;
      padding: 0.85rem;
    }

    .journal-title-block h1 {
      font-size: clamp(2.05rem, 13vw, 3.1rem);
    }

    .journal-title-block p {
      margin-top: 0.45rem;
      font-size: 0.82rem;
    }

    .journal-month-bar {
      grid-template-columns: 2.6rem minmax(0, 1fr) 2.6rem auto;
      align-items: end;
      gap: 0.4rem;
    }

    .icon-button {
      width: 2.6rem;
      height: 2.6rem;
    }

    .write-button {
      grid-column: auto;
      min-width: 0;
      min-height: 2.6rem;
      padding-inline: 0.8rem;
    }

    .journal-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .journal-strip-cell {
      min-height: 5.4rem;
      padding: 0.75rem;
      border-top: 0;
      border-left: 1px solid rgba(36, 24, 15, 0.14);
    }

    .journal-strip-cell:nth-child(odd) {
      border-left: 0;
    }

    .journal-strip-cell:nth-child(n + 3) {
      border-top: 1px solid rgba(36, 24, 15, 0.14);
    }

    .journal-strip-cell strong {
      font-size: 1.75rem;
    }

    .journal-strip-cell p {
      font-size: 0.76rem;
      -webkit-line-clamp: 1;
    }

    .journal-workspace {
      gap: 0.7rem;
    }

    .entries-panel,
    .journal-rail {
      padding: 0.8rem;
    }

    .panel-toolbar {
      display: grid;
      gap: 0.7rem;
      padding-bottom: 0.7rem;
    }

    .panel-toolbar h2 {
      font-size: 1.45rem;
    }

    .toolbar-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.4rem;
    }

    .toolbar-actions .ghost-action {
      width: 100%;
      min-height: 2.45rem;
      padding-inline: 0.45rem;
      font-size: 0.7rem;
    }

    .entry-row {
      grid-template-columns: minmax(0, 1fr) 2.25rem;
      min-height: 5.3rem;
      padding: 0.2rem 0;
    }

    .entry-main {
      grid-template-columns: minmax(0, 0.42fr) minmax(0, 1fr);
      gap: 0.55rem;
      padding: 0.65rem 0.45rem 0.65rem 0;
    }

    .entry-copy {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 0.78rem;
    }

    .entry-meta {
      grid-column: 1 / -1;
      justify-content: flex-start;
      font-size: 0.76rem;
    }

    .journal-rail {
      grid-template-columns: 1fr;
    }

    .journal-rail .rail-card:not(.rail-today) {
      display: none;
    }

    .rail-today {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }

    .rail-today .btn {
      min-height: 2.5rem;
      padding-inline: 0.8rem;
    }

    .journal-modal-backdrop {
      align-items: end;
      padding: 0.5rem;
    }

    .journal-modal {
      width: 100%;
      max-height: calc(100dvh - 1rem);
      border-radius: 10px 10px 0 0;
    }
  }

  @media (max-width: 420px) {
    .journal-page {
      padding: 0.5rem;
    }

    .journal-month-bar {
      grid-template-columns: 2.4rem minmax(0, 1fr) 2.4rem 2.7rem;
    }

    .month-field span {
      display: none;
    }

    .month-field input {
      min-height: 2.45rem;
      padding-inline: 0.5rem;
      font-size: 0.82rem;
    }

    .toolbar-actions .ghost-action {
      gap: 0.2rem;
      font-size: 0.64rem;
    }
  }
</style>
