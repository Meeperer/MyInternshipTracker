<script>
  import { journal } from '$stores/journal.js';
  import { toast } from '$stores/toast.js';
  import { formatDate, todayString } from '$utils/date.js';

  let { onDateSelect = () => {} } = $props();
  let exportLoading = $state(false);
  let exportFormat = $state('markdown');

  function formatHoursAsHMS(hours) {
    const h = Number(hours);
    if (isNaN(h) || h < 0) return '00:00:00';
    const totalSec = Math.round(h * 3600);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
  }

  let storeVal = $state({ entries: [], loading: false });
  let searchQuery = $state('');
  let hasFetched = false;

  journal.subscribe(v => storeVal = v);

  $effect(() => {
    if (!hasFetched) {
      hasFetched = true;
      const now = new Date();
      journal.fetchMonth(now.getFullYear(), now.getMonth() + 1);
    }
  });

  let filtered = $derived.by(() => {
    if (!searchQuery.trim()) return storeVal.entries;
    const q = searchQuery.toLowerCase();
    return storeVal.entries.filter(e =>
      (e.content_raw || '').toLowerCase().includes(q) ||
      (e.date || '').includes(q)
    );
  });

  function formatDateReadable(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function entriesToMarkdown(entries) {
    const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const lines = [
      '# Internship Journal Export',
      `**Exported:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `**Total Entries:** ${entries.length}`,
      `**Total Hours:** ${totalHours}`,
      '',
      '---',
      ''
    ];

    for (const entry of entries) {
      lines.push(`## ${formatDateReadable(entry.date)}`);
      lines.push('');
      lines.push(`**Hours:** ${entry.hours} | **Status:** ${entry.status}`);
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

  async function handleExportAll() {
    exportLoading = true;
    try {
      const entries = await journal.fetchAll();
      const dateStr = new Date().toISOString().slice(0, 10);

      let blob, filename;
      if (exportFormat === 'markdown') {
        const md = entriesToMarkdown(entries);
        blob = new Blob([md], { type: 'text/markdown' });
        filename = `journal-entries-${dateStr}.md`;
      } else {
        blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
        filename = `journal-entries-${dateStr}.json`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(entries.length ? `Exported your ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : 'Export complete (no entries in your account)');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      exportLoading = false;
    }
  }
</script>

<div class="journal-view">
  <div class="journal-header">
    <h2>Journal Entries</h2>
    <div class="journal-header-actions">
      <div class="export-group">
        <select class="export-select" bind:value={exportFormat} aria-label="Export format">
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
        </select>
        <button
          class="btn btn-sm"
          onclick={handleExportAll}
          disabled={exportLoading}
          title="Download all your journal entries"
        >
          {exportLoading ? 'Exporting...' : 'Export'}
        </button>
      </div>
      <button class="btn btn-sm btn-primary" onclick={() => onDateSelect(todayString())}>
        New Entry
      </button>
    </div>
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
    {#if storeVal.loading}
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Loading entries...</p>
      </div>
    {:else if storeVal.entries.length === 0}
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </div>
        <p>No journal entries yet.</p>
        <button class="btn btn-sm btn-primary" onclick={() => onDateSelect(todayString())}>
          Create your first entry
        </button>
      </div>
    {:else if filtered.length === 0}
      <div class="empty-state">
        <p>No entries match "{searchQuery}"</p>
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
    max-width: 900px;
    margin: 0 auto;
    padding: 3rem 2.5rem 4rem;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .journal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .journal-header h2 {
    font-size: 2.25rem;
  }

  .journal-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .export-group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .export-select {
    padding: 0.35rem 0.5rem;
    border: 2px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-ui);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: white;
    color: var(--dark);
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }
  .export-select:focus {
    outline: none;
    border-color: var(--red);
  }

  .journal-header .btn {
    padding: 0.65rem 1.35rem;
    font-size: 0.95rem;
  }

  .search-bar {
    margin-bottom: 2rem;
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
      margin-bottom: 1.5rem;
    }
    .journal-header h2 {
      font-size: 1.75rem;
    }
    .search-bar {
      margin-bottom: 1.5rem;
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
    .journal-header {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .journal-header h2 {
      font-size: 1.5rem;
    }
    .journal-header-actions {
      flex-wrap: wrap;
    }
    .journal-header .btn {
      flex: 1;
      justify-content: center;
    }
    .export-group {
      flex: 1;
    }
    .export-group .btn {
      flex: 1;
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
