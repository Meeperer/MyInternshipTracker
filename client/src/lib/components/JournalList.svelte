<script>
  import { onMount } from 'svelte';
  import { journal } from '$stores/journal.js';
  import { toast } from '$stores/toast.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import { appCommands } from '$stores/appCommands.js';
  import { buildJournalInsights } from '$utils/journalInsights.js';
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
  const parallaxTargets = new Map();
  let journalStageShellEl = $state(null);
  let journalStageEl = $state(null);
  let journalViewEl = $state(null);

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

  function formatSummaryType(period) {
    return period === 'week' ? 'Weekly summary' : 'Monthly summary';
  }

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getSummaryLabel(summary) {
    if (!summary) return '';
    if (summary.label) return summary.label;
    if (summary.period === 'month') {
      return formatMonthLabel(summary.start_date.slice(0, 7));
    }
    return `Week of ${formatRangeLabel(summary.start_date, summary.end_date)}`;
  }

  function getSummaryPreview(summaryText, maxLength = 210) {
    const normalized = String(summaryText || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return 'No saved summary text yet.';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3).trimEnd()}...` : normalized;
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
  let modalSummary = $state(null);
  let typedSummaryText = $state('');
  let summaryTypingActive = $state(false);
  let summaryModalCloseButton = $state(null);
  let summaryModalPreviousFocus = $state(null);
  let currentPage = $state(1);
  let expandedEntryDate = $state('');
  let summaryTypingTimer = null;
  let searchInputEl = $state(null);
  let summaryLibrarySectionEl = $state(null);
  let summaryLibraryHydrated = $state(false);

  function registerParallax(node, config = {}) {
    parallaxTargets.set(node, {
      depth: 1,
      blur: 0,
      start: 0.92,
      ...config
    });

    return {
      update(nextConfig = {}) {
        parallaxTargets.set(node, {
          depth: 1,
          blur: 0,
          start: 0.92,
          ...nextConfig
        });
      },
      destroy() {
        parallaxTargets.delete(node);
      }
    };
  }

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
  let journalInsights = $derived.by(() => buildJournalInsights($journal.entries));

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
    if (summaryLibraryHydrated) return;

    summaryLibraryHydrated = true;
    journal.fetchSummaryLibrary(36).catch(() => {});
  });

  $effect(() => {
    const command = $appCommands.pendingCommand;
    if (!command) return;

    if (command.type === 'open-journal-date' && command.date) {
      selectedMonth.setFromDate(command.date);
      onDateSelect(command.date);
      appCommands.consume(command.id);
      return;
    }

    if (command.type === 'focus-journal-search') {
      queueMicrotask(() => searchInputEl?.focus());
      appCommands.consume(command.id);
      return;
    }

    if (command.type === 'focus-summary-library') {
      queueMicrotask(() =>
        summaryLibrarySectionEl?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start'
        })
      );
      appCommands.consume(command.id);
    }
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
    modalSummary = null;
    typedSummaryText = '';
    summaryTypingActive = false;
    if (summaryTypingTimer) {
      clearInterval(summaryTypingTimer);
      summaryTypingTimer = null;
    }
  });

  $effect(() => {
    if (!showSummaryModal || !modalSummary?.summary) {
      typedSummaryText = '';
      summaryTypingActive = false;
      if (summaryTypingTimer) {
        clearInterval(summaryTypingTimer);
        summaryTypingTimer = null;
      }
      return;
    }

    const fullText = modalSummary.summary;

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

  onMount(() => {
    if (typeof window === 'undefined' || !journalViewEl || !journalStageEl || !journalStageShellEl) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const compactQuery = window.matchMedia('(max-width: 980px)');
    const mainHost = document.querySelector('main#main-content');
    const rootHost = document.scrollingElement || document.documentElement;
    const scroller = mainHost && (mainHost.scrollHeight - mainHost.clientHeight > 2) ? mainHost : rootHost;
    const previousMainOverflow = mainHost?.style.overflow ?? '';
    let cancelled = false;
    let gsapCore = null;
    let scrollTriggerPlugin = null;
    let gsapContext = null;

    const clearInlineMotion = () => {
      journalStageShellEl.style.removeProperty('height');
      journalStageShellEl.style.removeProperty('min-height');
      journalStageEl.style.removeProperty('height');
      journalStageEl.style.removeProperty('min-height');
      journalStageEl.style.removeProperty('overflow');
      journalViewEl.style.removeProperty('transform');
      journalViewEl.style.removeProperty('will-change');
      journalViewEl.style.removeProperty('padding-bottom');

      for (const node of parallaxTargets.keys()) {
        if (!(node instanceof HTMLElement)) continue;
        node.style.removeProperty('transform');
        node.style.removeProperty('opacity');
        node.style.removeProperty('will-change');
        node.style.removeProperty('transform-origin');
        node.style.removeProperty('transform-style');
        node.style.removeProperty('backface-visibility');
      }
    };

    const teardownMotion = () => {
      if (gsapContext) {
        gsapContext.revert();
        gsapContext = null;
      }
      clearInlineMotion();
    };

    const applyMotion = async () => {
      if (cancelled) return;

      if (motionQuery.matches || compactQuery.matches || parallaxTargets.size === 0) {
        teardownMotion();
        return;
      }

      if (mainHost && scroller === rootHost) {
        mainHost.style.overflow = 'visible';
      }

      if (!gsapCore || !scrollTriggerPlugin) {
        const [gsapModule, scrollTriggerModule] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger')
        ]);

        if (cancelled) return;

        gsapCore = gsapModule.gsap || gsapModule.default || gsapModule;
        scrollTriggerPlugin =
          scrollTriggerModule.ScrollTrigger || scrollTriggerModule.default || scrollTriggerModule;
        gsapCore.registerPlugin(scrollTriggerPlugin);
      }

      teardownMotion();

      gsapContext = gsapCore.context(() => {
        gsapCore.set(journalStageShellEl, { clearProps: 'all' });
        gsapCore.set(journalStageEl, { clearProps: 'all' });
        gsapCore.set(journalViewEl, { clearProps: 'all' });

        const orderedTargets = Array.from(parallaxTargets.entries());

        orderedTargets.forEach(([node, config], index) => {
          if (!(node instanceof HTMLElement) || !node.isConnected) return;

          const depth = Number(config.depth) || 1;
          const startRatio = Number(config.start) || 0.92;
          const startPoint = Math.round(startRatio * 100);
          const endPoint = Math.max(26, startPoint - 42);
          const incomingY = 42 + (depth * 12);
          const outgoingY = -12 - (depth * 4);
          const incomingScale = Math.max(0.955, 0.985 - (depth * 0.012));
          const outgoingScale = 1.006 + (depth * 0.002);
          const incomingRotate = (index % 2 === 0 ? 0.9 : -0.9) * Math.max(0.4, 1 - (depth * 0.18));
          const childNodes = Array.from(node.children).filter((child) => child instanceof HTMLElement);

          gsapCore.fromTo(
            node,
            {
              y: incomingY,
              scale: incomingScale,
              rotateZ: incomingRotate,
              autoAlpha: 0.26,
              backfaceVisibility: 'hidden',
              willChange: 'transform, opacity',
              force3D: true
            },
            {
              y: outgoingY,
              scale: outgoingScale,
              rotateZ: 0,
              autoAlpha: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: node,
                scroller: scroller === rootHost ? undefined : scroller,
                start: `top ${startPoint}%`,
                end: `bottom ${endPoint}%`,
                scrub: 0.8,
                invalidateOnRefresh: true
              }
            }
          );

          if (childNodes.length > 1) {
            gsapCore.fromTo(
              childNodes,
              {
                y: 18 + (depth * 2),
                autoAlpha: 0.62,
                force3D: true
              },
              {
                y: 0,
                autoAlpha: 1,
                ease: 'none',
                stagger: 0.035,
                scrollTrigger: {
                  trigger: node,
                  scroller: scroller === rootHost ? undefined : scroller,
                  start: `top ${Math.min(96, startPoint + 4)}%`,
                  end: `center ${Math.max(38, endPoint + 8)}%`,
                  scrub: 0.7,
                  invalidateOnRefresh: true
                }
              }
            );
          }
        });
      }, journalStageShellEl);

      scrollTriggerPlugin.refresh();
    };

    const handleMotionPreferenceChange = () => {
      applyMotion();
    };

    applyMotion();

    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', handleMotionPreferenceChange);
    } else {
      motionQuery.addListener(handleMotionPreferenceChange);
    }

    if (typeof compactQuery.addEventListener === 'function') {
      compactQuery.addEventListener('change', handleMotionPreferenceChange);
    } else {
      compactQuery.addListener(handleMotionPreferenceChange);
    }

    return () => {
      cancelled = true;
      teardownMotion();
      if (mainHost) {
        mainHost.style.overflow = previousMainOverflow;
      }

      if (typeof motionQuery.removeEventListener === 'function') {
        motionQuery.removeEventListener('change', handleMotionPreferenceChange);
      } else {
        motionQuery.removeListener(handleMotionPreferenceChange);
      }

      if (typeof compactQuery.removeEventListener === 'function') {
        compactQuery.removeEventListener('change', handleMotionPreferenceChange);
      } else {
        compactQuery.removeListener(handleMotionPreferenceChange);
      }
    };
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

  function openSummaryModal(summary = summaryResult) {
    const resolvedSummary = summary?.summary ? summary : summaryResult;
    if (!resolvedSummary?.summary) return;
    summaryModalPreviousFocus = typeof document !== 'undefined' ? document.activeElement : null;
    modalSummary = {
      ...resolvedSummary,
      label: getSummaryLabel(resolvedSummary)
    };
    typedSummaryText = prefersReducedMotion() ? resolvedSummary.summary : '';
    summaryTypingActive = !prefersReducedMotion();
    showSummaryModal = true;
  }

  function closeSummaryModal() {
    showSummaryModal = false;
    modalSummary = null;
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

  async function toggleSummaryPin(summary) {
    try {
      const next = await journal.toggleSummaryPin(summary.id, !summary.pinned);
      if (modalSummary?.id === next.id) {
        modalSummary = {
          ...modalSummary,
          ...next,
          label: getSummaryLabel(next)
        };
      }
      if (summaryResult?.id === next.id) {
        summaryResult = {
          ...summaryResult,
          ...next,
          label: getSummaryLabel(next)
        };
      }
      toast.success(next.pinned ? 'Summary pinned to the library' : 'Summary unpinned');
    } catch (error) {
      toast.error(error.message || 'Failed to update summary pin');
    }
  }

  function exportSummary(summary, format = 'markdown') {
    const label = getSummaryLabel(summary);
    const periodLabel = formatSummaryType(summary.period);
    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let blob;
    let filename;

    if (format === 'json') {
      blob = new Blob([JSON.stringify({
        id: summary.id,
        period: summary.period,
        label,
        start_date: summary.start_date,
        end_date: summary.end_date,
        entry_count: summary.entry_count,
        summarized_entry_count: summary.summarized_entry_count,
        total_hours: summary.total_hours,
        updated_at: summary.updated_at,
        pinned: summary.pinned,
        summary: summary.summary
      }, null, 2)], { type: 'application/json' });
      filename = `${safeLabel || 'journal-summary'}.json`;
    } else {
      const markdown = [
        `# ${periodLabel}`,
        '',
        `**Label:** ${label}`,
        `**Date range:** ${summary.start_date} to ${summary.end_date}`,
        `**Entries:** ${summary.entry_count}`,
        `**Hours:** ${formatHoursValue(summary.total_hours)}`,
        `**Saved:** ${summary.pinned ? 'Pinned' : 'Standard'}`,
        '',
        summary.summary
      ].join('\n');
      blob = new Blob([markdown], { type: 'text/markdown' });
      filename = `${safeLabel || 'journal-summary'}.md`;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="journal-stage-shell" bind:this={journalStageShellEl}>
  <div class="journal-stage" bind:this={journalStageEl}>
    <div class="journal-view" bind:this={journalViewEl} aria-busy={$journal.loading || summaryLoading}>
  <section
    class="journal-hero journal-parallax animate-rise rise-1"
    use:registerParallax={{ depth: 0.38, blur: 1.4, start: 0.96 }}
  >
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
    <article class="overview-card journal-parallax" use:registerParallax={{ depth: 0.72, blur: 1.1, start: 1 }}>
      <span class="overview-label">Selected month</span>
      <strong>{formatMonthLabel($selectedMonth)}</strong>
      <p>{$journal.entries.length} entr{$journal.entries.length === 1 ? 'y' : 'ies'} tracked</p>
    </article>
    <article class="overview-card journal-parallax" use:registerParallax={{ depth: 0.88, blur: 1.1, start: 1 }}>
      <span class="overview-label">Hours logged</span>
      <strong>{formatHoursValue(monthHours)}</strong>
      <p>Across the current month</p>
    </article>
    <article class="overview-card journal-parallax" use:registerParallax={{ depth: 1.04, blur: 1.1, start: 1 }}>
      <span class="overview-label">Finished days</span>
      <strong>{monthFinishedCount}</strong>
      <p>Locked and completed</p>
    </article>
  </section>

  <section class="insights-grid animate-rise rise-3">
    <article class="insights-panel card glass-card journal-parallax" use:registerParallax={{ depth: 0.92, blur: 1.35, start: 0.98 }}>
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Recurring themes</span>
          <h3>What keeps showing up</h3>
        </div>
      </div>

      {#if journalInsights.recurringThemes.length > 0}
        <div class="theme-chip-list">
          {#each journalInsights.recurringThemes as theme}
            <span class="theme-chip">
              <strong>{theme.label}</strong>
              <span>{theme.count}x</span>
            </span>
          {/each}
        </div>
      {:else}
        <div class="insights-empty">
          <strong>Themes appear once your entries have more detail.</strong>
          <p>Add a few fuller notes and the journal will start surfacing repeated work patterns here.</p>
        </div>
      {/if}
    </article>

    <article class="insights-panel card glass-card journal-parallax" use:registerParallax={{ depth: 1.05, blur: 1.35, start: 0.98 }}>
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Mood + workload</span>
          <h3>How the month feels</h3>
        </div>
      </div>

      {#if journalInsights.workloadTrend.length > 0}
        <div class="trend-list">
          {#each journalInsights.workloadTrend as week}
            <div class="trend-row">
              <div class="trend-copy">
                <strong>{week.label}</strong>
                <span>{week.entries} entr{week.entries === 1 ? 'y' : 'ies'} | {week.tone}</span>
              </div>
              <div class="trend-bar-shell" aria-hidden="true">
                <span class="trend-bar-fill" style={`width: ${Math.min(100, Math.max(14, week.hours * 10))}%`}></span>
              </div>
              <span class="trend-hours">{formatHoursValue(week.hours)}h</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="insights-empty">
          <strong>No trend line yet.</strong>
          <p>Once you log a few entries, this section will show how busy each week looked and how the writing tone shifted.</p>
        </div>
      {/if}
    </article>

    <article class="insights-panel card glass-card journal-parallax" use:registerParallax={{ depth: 1.18, blur: 1.45, start: 0.98 }}>
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Top wins</span>
          <h3>Work worth keeping</h3>
        </div>
      </div>

      {#if journalInsights.topWins.length > 0}
        <div class="insight-note-list">
          {#each journalInsights.topWins as win}
            <div class="insight-note insight-note-win">
              <p>{win}</p>
            </div>
          {/each}
        </div>
      {:else}
        <div class="insights-empty">
          <strong>No wins captured yet.</strong>
          <p>Use a sentence or two when you finish something meaningful so the month can surface it back to you.</p>
        </div>
      {/if}
    </article>

    <article class="insights-panel card glass-card journal-parallax" use:registerParallax={{ depth: 1.28, blur: 1.45, start: 0.98 }}>
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Blockers</span>
          <h3>What slowed you down</h3>
        </div>
      </div>

      {#if journalInsights.blockers.length > 0}
        <div class="insight-note-list">
          {#each journalInsights.blockers as blocker}
            <div class="insight-note insight-note-blocker">
              <p>{blocker}</p>
            </div>
          {/each}
        </div>
      {:else}
        <div class="insights-empty">
          <strong>No clear blockers spotted.</strong>
          <p>Your recent notes read as steady progress, without repeated friction surfacing in the writing.</p>
        </div>
      {/if}
    </article>
  </section>

  <section class="workspace-grid animate-rise rise-4">
    <div
      class="journal-controls card glass-card journal-parallax"
      use:registerParallax={{ depth: 1.1, blur: 0.85, start: 0.98 }}
    >
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

    <div
      class="summary-panel card glass-card journal-parallax"
      aria-live="polite"
      use:registerParallax={{ depth: 1.22, blur: 0.85, start: 0.98 }}
    >
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
            onclick={() => openSummaryModal(summaryResult)}
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

  <section
    class="summary-library-shell card glass-card animate-rise rise-5 journal-parallax"
    bind:this={summaryLibrarySectionEl}
    use:registerParallax={{ depth: 1.3, blur: 0.8, start: 0.985 }}
  >
    <div class="summary-library-header">
      <div>
        <span class="panel-kicker">Summary library</span>
        <h3>Saved weekly + monthly reads</h3>
        <p class="summary-caption">Reopen, pin, and export your saved summaries without regenerating them.</p>
      </div>
      <span class="summary-library-count">{$journal.summaryLibrary.length} saved</span>
    </div>

    {#if $journal.summaryLibraryLoading}
      <div class="summary-library-list">
        {#each Array.from({ length: 3 }) as _, index}
          <div class="summary-library-item summary-library-skeleton" style={`animation-delay: ${index * 40}ms;`}>
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line long"></div>
            <div class="skeleton-line short"></div>
          </div>
        {/each}
      </div>
    {:else if $journal.summaryLibrary.length > 0}
      <div class="summary-library-list">
        {#each $journal.summaryLibrary as item}
          <article class:pinned={item.pinned} class="summary-library-item">
            <div class="summary-library-copy">
              <div class="summary-library-meta">
                <span class="summary-library-type">{formatSummaryType(item.period)}</span>
                {#if item.pinned}
                  <span class="summary-library-pin">Pinned</span>
                {/if}
              </div>
              <h4>{getSummaryLabel(item)}</h4>
              <p>{getSummaryPreview(item.summary)}</p>
              <span class="summary-library-footnote">
                {item.start_date} to {item.end_date} | {item.entry_count} entr{item.entry_count === 1 ? 'y' : 'ies'} | {formatHoursValue(item.total_hours)}h
              </span>
            </div>
            <div class="summary-library-actions">
              <button type="button" class="btn btn-sm btn-primary" onclick={() => openSummaryModal(item)}>
                Open
              </button>
              <button type="button" class="btn btn-sm" onclick={() => exportSummary(item, 'markdown')}>
                Markdown
              </button>
              <button type="button" class="btn btn-sm" onclick={() => exportSummary(item, 'json')}>
                JSON
              </button>
              <button type="button" class="btn btn-sm" onclick={() => toggleSummaryPin(item)}>
                {item.pinned ? 'Unpin' : 'Pin'}
              </button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="insights-empty summary-library-empty">
        <strong>Your library starts filling as soon as a week or month gets summarized.</strong>
        <p>Saved summaries stay here so you can reopen them later, pin the best ones, and export them cleanly.</p>
      </div>
    {/if}
  </section>

  <div
    class="search-shell animate-rise rise-6 journal-parallax"
    use:registerParallax={{ depth: 1.36, blur: 0.68, start: 0.99 }}
  >
    <input
      bind:this={searchInputEl}
      class="input search-input"
      type="text"
      placeholder="Search entries by content or date..."
      bind:value={searchQuery}
      aria-label="Search journal entries"
    />
  </div>

  <section
    class="entries-shell card glass-card animate-rise rise-6 journal-parallax"
    aria-live="polite"
    use:registerParallax={{ depth: 1.42, blur: 0.72, start: 1 }}
  >
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
  </div>
</div>

{#if showSummaryModal && modalSummary}
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
          <span class="summary-modal-kicker">{modalSummary.label}</span>
          <h3 id="summary-modal-title">Summarized {formatSummaryPeriodLabel(modalSummary.period)}</h3>
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
        <span>{modalSummary.entry_count} entr{modalSummary.entry_count === 1 ? 'y' : 'ies'}</span>
        <span>{formatHoursValue(modalSummary.total_hours)} hours</span>
        <span>{modalSummary.persisted === false ? 'Live only' : modalSummary.pinned ? 'Pinned' : 'Saved'}</span>
      </div>

      <div class="summary-modal-body">
        <p
          id="summary-modal-copy"
          class:typing={summaryTypingActive}
          class="summary-modal-copy"
        >
          {summaryTypingActive ? typedSummaryText : typedSummaryText || modalSummary.summary}
        </p>
      </div>

      <div class="summary-modal-footer">
        <span class="summary-footnote">
          Updated {new Date(modalSummary.updated_at || toDateString(new Date())).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </span>
        <div class="summary-modal-footer-actions">
          {#if modalSummary.id}
            <button type="button" class="btn btn-sm" onclick={() => toggleSummaryPin(modalSummary)}>
              {modalSummary.pinned ? 'Unpin' : 'Pin'}
            </button>
          {/if}
          <button type="button" class="btn btn-sm" onclick={() => exportSummary(modalSummary, 'markdown')}>
            Export
          </button>
          <button type="button" class="btn btn-sm" onclick={closeSummaryModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .journal-stage-shell {
    position: relative;
    width: 100%;
  }

  .journal-stage {
    position: relative;
    width: 100%;
    display: flex;
    justify-content: center;
    overflow: visible;
  }

  .journal-view {
    flex: 1;
    max-width: 1120px;
    margin: 0 auto;
    padding: 2rem 2.25rem 5rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    overflow: visible;
  }

  .journal-parallax {
    transform: translate3d(0, 0, 0) scale(1);
    transform-origin: center center;
    opacity: 1;
    will-change: transform, opacity;
    backface-visibility: hidden;
  }

  .journal-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.9fr);
    gap: 1.25rem;
    align-items: end;
    padding: 1.35rem 1.45rem;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(190, 53, 25, 0.14);
    box-shadow: 0 10px 22px rgba(34, 24, 8, 0.05);
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

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .insights-panel {
    padding: 1.25rem 1.35rem;
  }

  .theme-chip-list,
  .insight-note-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .theme-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(190, 53, 25, 0.1);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--dark-soft);
  }

  .theme-chip strong {
    color: var(--red);
    font-size: 0.9rem;
  }

  .trend-list {
    display: grid;
    gap: 0.85rem;
    margin-top: 1rem;
  }

  .trend-row {
    display: grid;
    grid-template-columns: minmax(0, 160px) minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
  }

  .trend-copy {
    display: grid;
    gap: 0.2rem;
  }

  .trend-copy strong {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--red);
  }

  .trend-copy span,
  .trend-hours {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--dark-soft);
  }

  .trend-bar-shell {
    position: relative;
    min-height: 12px;
    border-radius: 999px;
    background: rgba(212, 212, 200, 0.52);
    overflow: hidden;
  }

  .trend-bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: rgba(190, 53, 25, 0.88);
  }

  .insight-note {
    flex: 1 1 240px;
    padding: 0.95rem 1rem;
    border-radius: 16px;
    border: 1px solid rgba(190, 53, 25, 0.1);
    background: rgba(255, 255, 255, 0.9);
  }

  .insight-note p {
    margin: 0;
    line-height: 1.65;
    color: var(--dark);
  }

  .insight-note-win {
    background: rgba(249, 252, 247, 0.96);
    border-color: rgba(45, 122, 58, 0.16);
  }

  .insight-note-blocker {
    background: rgba(255, 250, 246, 0.96);
    border-color: rgba(190, 53, 25, 0.14);
  }

  .insights-empty {
    margin-top: 1rem;
    padding: 1rem 1.05rem;
    border-radius: 18px;
    border: 1px dashed rgba(190, 53, 25, 0.16);
    background: rgba(255, 255, 255, 0.78);
    color: var(--dark-soft);
  }

  .insights-empty strong {
    display: block;
    margin-bottom: 0.35rem;
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--red);
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
    border-radius: 18px;
    border: 1px solid rgba(190, 53, 25, 0.12);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 10px 24px rgba(34, 24, 8, 0.05);
    backdrop-filter: none;
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
    background: var(--red);
    color: var(--bg);
    box-shadow: none;
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

  .summary-modal-footer-actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: flex-end;
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

  .summary-library-shell {
    padding: 1.35rem 1.4rem;
  }

  .summary-library-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .summary-library-count {
    padding: 0.45rem 0.8rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.84);
    border: 1px solid rgba(190, 53, 25, 0.1);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    color: var(--dark-soft);
  }

  .summary-library-list {
    display: grid;
    gap: 0.85rem;
    margin-top: 1rem;
  }

  .summary-library-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 1rem 1.05rem;
    border-radius: 20px;
    border: 1px solid rgba(190, 53, 25, 0.1);
    background: rgba(255, 255, 255, 0.88);
    transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
  }

  .summary-library-item:hover {
    transform: translateY(-1px);
    border-color: rgba(190, 53, 25, 0.18);
    box-shadow: 0 14px 28px rgba(34, 24, 8, 0.06);
  }

  .summary-library-item.pinned {
    border-color: rgba(184, 134, 11, 0.22);
    background: rgba(255, 251, 240, 0.96);
  }

  .summary-library-copy {
    min-width: 0;
  }

  .summary-library-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }

  .summary-library-type,
  .summary-library-pin {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .summary-library-type {
    background: rgba(190, 53, 25, 0.08);
    color: var(--red);
  }

  .summary-library-pin {
    background: rgba(184, 134, 11, 0.14);
    color: var(--warning);
  }

  .summary-library-item h4 {
    margin: 0;
    font-size: 1.18rem;
  }

  .summary-library-item p {
    margin: 0.35rem 0 0.55rem;
    color: var(--dark-soft);
    line-height: 1.65;
  }

  .summary-library-footnote {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    color: var(--dark-soft);
  }

  .summary-library-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-content: flex-start;
    justify-content: flex-end;
    min-width: 208px;
  }

  .summary-library-skeleton {
    display: grid;
    gap: 0.55rem;
  }

  .summary-library-empty {
    margin-top: 1rem;
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
    overflow: visible;
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

    .journal-parallax {
      transform: none !important;
      filter: none !important;
      opacity: 1 !important;
    }

    .journal-hero,
    .insights-grid,
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
    .summary-library-header,
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
    .summary-modal-footer .btn,
    .summary-library-actions .btn {
      width: 100%;
      justify-content: center;
    }

    .summary-library-item,
    .trend-row {
      grid-template-columns: 1fr;
    }

    .summary-library-actions {
      min-width: 0;
      justify-content: stretch;
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
    .summary-library-shell,
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

  /* Flatter journal pass */
  .journal-view {
    max-width: 1120px;
    padding-top: 2rem;
    gap: 1rem;
  }

  .journal-hero {
    padding: 1.25rem 1.35rem;
    border-radius: 18px;
    background: rgba(255, 254, 248, 0.96);
    box-shadow: 0 10px 20px rgba(34, 24, 8, 0.04);
  }

  .journal-hero h2 {
    font-size: clamp(1.9rem, 3vw, 2.45rem);
  }

  .overview-card,
  .glass-card,
  .summary-state,
  .summary-result,
  .summary-library-item,
  .entry-accordion,
  .entry-panel,
  .entry-detail-block,
  .entry-aras-card {
    background: rgba(255, 254, 248, 0.94);
  }

  .glass-card {
    border-radius: 18px;
    background: rgba(255, 254, 248, 0.96);
    box-shadow: 0 12px 24px rgba(34, 24, 8, 0.05);
    backdrop-filter: none;
  }

  .trend-bar-fill,
  .period-toggle button.active {
    background: var(--red);
    box-shadow: none;
  }

  .insight-note-win {
    background: rgba(45, 122, 58, 0.07);
  }

  .insight-note-blocker {
    background: rgba(190, 53, 25, 0.05);
  }

  .summary-library-item.pinned {
    background: rgba(184, 134, 11, 0.08);
  }

  .summary-panel,
  .journal-controls,
  .entries-shell,
  .summary-library-shell {
    padding: 1.15rem 1.2rem;
  }

  .summary-open-button {
    min-height: 44px;
  }

  .summary-modal-overlay {
    padding: 0.85rem;
  }

  .summary-modal {
    width: min(760px, calc(100vw - 1.7rem));
    max-height: calc(100vh - 1.7rem);
    border-radius: 18px;
  }

  .summary-modal-body {
    max-height: min(52vh, 28rem);
    min-height: 11rem;
  }

  @media (max-width: 768px) {
    .journal-view {
      padding-top: 1.6rem;
    }

    .summary-modal {
      width: min(100vw - 1rem, 100%);
      padding: 1.2rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .journal-parallax {
      transform: none !important;
      filter: none !important;
      opacity: 1 !important;
      transition: none;
      will-change: auto;
    }
  }
</style>
