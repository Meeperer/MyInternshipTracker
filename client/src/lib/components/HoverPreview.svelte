<script>
  let {
    visible = false,
    x = 0,
    y = 0,
    date = '',
    hours = 0,
    eventCount = 0,
    dayEvents = [],
    journalStatus = '',
    onLogHours = () => {},
    onAddEvent = () => {},
    onJournalEntry = () => {},
    onMouseEnter = () => {},
    onMouseLeave = () => {}
  } = $props();

  function formatTimeRange(ev) {
    const s = ev.start_time?.slice(0, 5);
    const e = ev.end_time?.slice(0, 5);
    if (s && e) return `${s} – ${e}`;
    if (s) return s;
    if (e) return `until ${e}`;
    return '';
  }

  const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let formattedDate = $derived.by(() => {
    if (!date) return '';
    const parts = date.split('-');
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);
    return `${MONTH_SHORT[m]} ${d}`;
  });

  let statusLabel = $derived.by(() => {
    if (journalStatus === 'finished') return 'Finished';
    if (journalStatus === 'draft') return 'Draft';
    return 'None';
  });

  let hasActivity = $derived(hours > 0 || eventCount > 0 || journalStatus);
</script>

{#if visible}
  <div
    class="hover-preview"
    style="left: {x}px; top: {y}px;"
    role="tooltip"
    aria-live="polite"
    onmouseenter={onMouseEnter}
    onmouseleave={onMouseLeave}
  >
    <div class="preview-date">{formattedDate}</div>

    {#if hasActivity}
      <div class="preview-stats">
        {#if hours > 0}
          <div class="stat-row">
            <span class="stat-label">Hours</span>
            <span class="stat-value">{hours}</span>
          </div>
        {/if}
        {#if dayEvents.length > 0}
          <div class="preview-events">
            <span class="stat-label">Events</span>
            {#each dayEvents as ev}
              <div class="preview-event-item">
                <span class="preview-event-title">{ev.title}</span>
                {#if formatTimeRange(ev)}
                  <span class="preview-event-time">{formatTimeRange(ev)}</span>
                {/if}
              </div>
            {/each}
          </div>
        {:else if eventCount > 0}
          <div class="stat-row">
            <span class="stat-label">Events</span>
            <span class="stat-value">{eventCount}</span>
          </div>
        {/if}
        <div class="stat-row">
          <span class="stat-label">Journal</span>
          <span class="stat-value">{statusLabel}</span>
        </div>
      </div>
    {:else}
      <div class="preview-empty">No activity logged</div>
    {/if}

    <div class="preview-actions">
      <button type="button" class="quick-btn" onclick={onLogHours}>Log Hours</button>
      <button type="button" class="quick-btn" onclick={onAddEvent}>Add Event</button>
      <button type="button" class="quick-btn" onclick={onJournalEntry}>Journal</button>
    </div>
  </div>
{/if}

<style>
  .hover-preview {
    position: fixed;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 0.75rem 1rem;
    min-width: 160px;
    max-width: 220px;
    pointer-events: auto;
    animation: previewFadeIn 0.2s var(--ease-out);
    font-family: var(--font-ui);
  }

  .preview-date {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--red);
    margin-bottom: 0.5rem;
    letter-spacing: 0.02em;
  }

  .preview-stats {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-bottom: 0.6rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
  }

  .stat-label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-soft);
  }

  .stat-value {
    font-weight: 600;
    color: var(--dark);
  }

  .preview-empty {
    font-size: 0.75rem;
    font-style: italic;
    color: var(--dark-soft);
    margin-bottom: 0.6rem;
  }

  .preview-events {
    margin-bottom: 0.4rem;
    max-height: 5.5rem;
    overflow-y: auto;
  }
  .preview-events > .stat-label {
    display: block;
    margin-bottom: 0.25rem;
  }
  .preview-event-item {
    font-size: 0.72rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--border-light);
  }
  .preview-event-item:last-child {
    border-bottom: none;
  }
  .preview-event-title {
    display: block;
    font-weight: 600;
    color: var(--dark);
    line-height: 1.3;
  }
  .preview-event-time {
    display: block;
    font-size: 0.65rem;
    color: var(--dark-soft);
    letter-spacing: 0.02em;
    margin-top: 0.05rem;
  }

  .preview-actions {
    display: flex;
    gap: 0.3rem;
    border-top: 1px solid var(--border-light);
    padding-top: 0.5rem;
  }

  .quick-btn {
    flex: 1;
    font-family: var(--font-ui);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.25rem 0.2rem;
    background: none;
    border: 1px solid var(--border);
    color: var(--dark-soft);
    cursor: pointer;
    transition: all 0.15s var(--ease-out);
    text-align: center;
  }

  .quick-btn:hover {
    border-color: var(--red);
    color: var(--red);
  }

  @keyframes previewFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 768px) {
    .hover-preview {
      display: none;
    }
  }
</style>
