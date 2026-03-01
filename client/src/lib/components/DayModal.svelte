<script>
  import { journal } from '$stores/journal.js';
  import { progress } from '$stores/progress.js';
  import { events } from '$stores/events.js';
  import { toast } from '$stores/toast.js';
  import { formatDateLong } from '$utils/date.js';
  import EventForm from './EventForm.svelte';

  let { date = '', onClose = () => {} } = $props();

  let entry = $state(null);
  let dayEvents = $state([]);
  let loading = $state(true);
  let mode = $state('view');
  let confirmingFinish = $state(false);
  let confirmingUnsaved = $state(false);
  let pendingAction = $state(null); // 'close' | 'view'
  let showEventForm = $state(false);
  let editingEvent = $state(null);

  let hours = $state('');
  let contentRaw = $state('');
  let refining = $state(false);
  let generatingAras = $state(false);
  let finishing = $state(false);
  let hoursError = $state('');
  let initialHoursOnEdit = $state('');
  let initialContentOnEdit = $state('');
  let modalContentEl = $state(null);
  let previousActiveElement = $state(null);

  const isDirty = $derived(
    (mode === 'edit' && (hours !== initialHoursOnEdit || contentRaw !== initialContentOnEdit)) ||
    (mode === 'log-hours' && hours !== initialHoursOnEdit)
  );

  $effect(() => {
    if (date) {
      if (typeof document !== 'undefined') previousActiveElement = document.activeElement;
      loadEntry();
    }
  });

  $effect(() => {
    if (loading || !modalContentEl) return;
    const el = modalContentEl;
    const focusables = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first) first.focus();
    function onKeydown(e) {
      if (e.key === 'Escape') {
        if (showEventForm) {
          showEventForm = false;
          editingEvent = null;
        } else if (confirmingFinish) {
          confirmingFinish = false;
        } else if (confirmingUnsaved) {
          confirmingUnsaved = false;
          pendingAction = null;
        } else if (isDirty) {
          confirmingUnsaved = true;
          pendingAction = 'close';
        } else {
          returnFocus();
          onClose();
        }
        e.preventDefault();
        return;
      }
      if (e.key !== 'Tab') return;
      const target = e.target;
      if (e.shiftKey) {
        if (target === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (target === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    el.addEventListener('keydown', onKeydown);
    return () => el.removeEventListener('keydown', onKeydown);
  });

  function returnFocus() {
    if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
      previousActiveElement.focus();
    }
  }

  function requestClose() {
    if (isDirty) {
      confirmingUnsaved = true;
      pendingAction = 'close';
    } else {
      returnFocus();
      onClose();
    }
  }

  function requestModeView() {
    if (isDirty) {
      confirmingUnsaved = true;
      pendingAction = 'view';
    } else {
      mode = 'view';
    }
  }

  function confirmDiscard() {
    confirmingUnsaved = false;
    if (pendingAction === 'close') {
      returnFocus();
      onClose();
    } else if (pendingAction === 'view') {
      mode = 'view';
    }
    pendingAction = null;
  }

  async function loadEntry() {
    loading = true;
    entry = await journal.fetchDate(date);
    dayEvents = await events.fetchDate(date);
    showEventForm = false;
    editingEvent = null;
    if (entry) {
      hours = String(entry.hours || '');
      contentRaw = entry.content_raw || '';
    } else {
      hours = '';
      contentRaw = '';
    }
    mode = 'view';
    initialHoursOnEdit = '';
    initialContentOnEdit = '';
    loading = false;
  }

  function enterEditMode() {
    initialHoursOnEdit = hours;
    initialContentOnEdit = contentRaw;
    mode = 'edit';
    hoursError = '';
  }

  function enterLogHoursMode() {
    initialHoursOnEdit = hours;
    mode = 'log-hours';
    hoursError = '';
  }

  function validateHours(allowZero = false) {
    const n = parseFloat(hours);
    if (hours === '' || isNaN(n)) {
      hoursError = 'Enter hours (0–24)';
      return false;
    }
    if (n < 0 || n > 24) {
      hoursError = 'Hours must be between 0 and 24';
      return false;
    }
    if (!allowZero && n <= 0) {
      hoursError = 'Enter at least 0.5 hours';
      return false;
    }
    hoursError = '';
    return true;
  }

  async function saveEntry() {
    if (!validateHours(true)) return;
    try {
      const result = await journal.save({
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw
      });
      entry = result;
      mode = 'view';
      toast.success('Entry saved');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function logHoursOnly() {
    if (!validateHours(false)) return;
    try {
      const result = await journal.logHours(date, parseFloat(hours));
      entry = result;
      await progress.fetch();
      toast.success('Hours logged');
      mode = 'view';
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function finishDay() {
    confirmingFinish = true;
  }

  async function confirmFinishDay() {
    confirmingFinish = false;
    finishing = true;
    try {
      const result = await journal.finishDay(date);
      entry = result;
      await progress.fetch();
      toast.success('Day finished and locked');
    } catch (err) {
      toast.error(err.message);
    } finally {
      finishing = false;
    }
  }

  async function refineWithAI() {
    if (!entry?.id || !contentRaw || contentRaw.trim().length < 10) {
      toast.error('Write at least 10 characters before refining');
      return;
    }
    refining = true;
    try {
      const { refined } = await journal.refineWithAI(entry.id, contentRaw);
      entry = { ...entry, content_ai_refined: refined };
      toast.success('Content refined by AI');
    } catch (err) {
      toast.error(err.message);
    } finally {
      refining = false;
    }
  }

  async function generateARAS() {
    const content = entry?.content_ai_refined || contentRaw;
    if (!entry?.id || !content || content.trim().length < 10) {
      toast.error('Need content to generate ARAS');
      return;
    }
    generatingAras = true;
    try {
      const { aras } = await journal.generateARAS(entry.id, content);
      entry = {
        ...entry,
        aras_action: aras.action,
        aras_reflection: aras.reflection,
        aras_analysis: aras.analysis,
        aras_summary: aras.summary
      };
      toast.success('ARAS structure generated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      generatingAras = false;
    }
  }

  async function loadEventsList() {
    dayEvents = await events.fetchDate(date);
  }

  let isFinished = $derived(entry?.status === 'finished');
  let statusText = $derived(
    !entry ? 'Not Started' : entry.status === 'finished' ? 'Finished' : 'In Progress'
  );
  let statusClass = $derived(
    !entry ? '' : entry.status === 'finished' ? 'badge-finished' : 'badge-draft'
  );

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) requestClose();
  }

  function handleOverlayKeydown(e) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      requestClose();
    }
  }
</script>

<div
  class="modal-overlay"
  onclick={handleOverlayClick}
  onkeydown={handleOverlayKeydown}
  role="dialog"
  aria-modal="true"
  aria-label="Journal entry for {date}"
  tabindex="-1"
>
  <div class="modal-content" bind:this={modalContentEl}>
    {#if loading}
      <div class="loading-text" aria-live="polite">
        <div class="spinner"></div>
        <p>Loading entry...</p>
      </div>
    {:else}
      <div class="modal-header">
        <h2>{formatDateLong(date)}</h2>
        <div class="header-meta">
          <span class="badge {statusClass}">{statusText}</span>
          {#if entry}
            <span class="hours-badge">{entry.hours} {Number(entry.hours) === 1 ? 'hour' : 'hours'} rendered</span>
          {/if}
        </div>
        <button class="close-btn" onclick={requestClose} aria-label="Close">&times;</button>
      </div>

      {#if confirmingUnsaved}
        <div class="confirm-dialog" role="alertdialog" aria-label="Discard changes?">
          <p>You have unsaved changes. Discard them?</p>
          <div class="confirm-actions">
            <button class="btn" onclick={() => { confirmingUnsaved = false; pendingAction = null; }}>Keep editing</button>
            <button class="btn btn-primary" onclick={confirmDiscard}>Discard</button>
          </div>
        </div>
      {:else if showEventForm}
        <EventForm
          {date}
          event={editingEvent}
          onSave={() => {
            showEventForm = false;
            editingEvent = null;
            loadEventsList();
          }}
          onCancel={() => {
            showEventForm = false;
            editingEvent = null;
          }}
          onDelete={() => {
            showEventForm = false;
            editingEvent = null;
            loadEventsList();
          }}
        />
      {:else if confirmingFinish}
        <div class="confirm-dialog" role="alertdialog" aria-label="Confirm finish day">
          <div class="confirm-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3>Finish this day?</h3>
          <p>This will lock the entry and hours permanently. This action cannot be undone.</p>
          <div class="confirm-actions">
            <button class="btn" onclick={() => (confirmingFinish = false)}>Cancel</button>
            <button class="btn btn-primary" onclick={confirmFinishDay}>Finish Day</button>
          </div>
        </div>
      {:else if mode === 'view'}
        <div class="action-buttons">
          {#if !isFinished}
            <button class="btn btn-sm" onclick={enterEditMode}>
              {entry ? 'Edit Entry' : 'Add Entry'}
            </button>
            <button class="btn btn-sm" onclick={enterLogHoursMode}>
              Log Hours
            </button>
            <button class="btn btn-sm" onclick={() => { showEventForm = true; editingEvent = null; }}>
              Add Event
            </button>
            {#if entry && entry.hours > 0}
              <button class="btn btn-sm btn-primary" onclick={finishDay} disabled={finishing}>
                {finishing ? 'Finishing...' : 'Finish Day'}
              </button>
            {/if}
          {/if}
        </div>

        {#if entry}
          {#if entry.content_raw}
            <div class="section">
              <h4>Journal Entry</h4>
              <p class="entry-content">{entry.content_raw}</p>
            </div>
          {/if}

          {#if entry.content_ai_refined}
            <div class="section">
              <h4>AI-Refined Content</h4>
              <p class="entry-content refined">{entry.content_ai_refined}</p>
            </div>
          {/if}

          {#if entry.aras_action || entry.aras_reflection || entry.aras_analysis || entry.aras_summary}
            <div class="aras-sections">
              <h4>ARAS Structure</h4>
              {#if entry.aras_action}
                <div class="aras-block">
                  <span class="aras-label">Action</span>
                  <p>{entry.aras_action}</p>
                </div>
              {/if}
              {#if entry.aras_reflection}
                <div class="aras-block">
                  <span class="aras-label">Reflection</span>
                  <p>{entry.aras_reflection}</p>
                </div>
              {/if}
              {#if entry.aras_analysis}
                <div class="aras-block">
                  <span class="aras-label">Analysis</span>
                  <p>{entry.aras_analysis}</p>
                </div>
              {/if}
              {#if entry.aras_summary}
                <div class="aras-block">
                  <span class="aras-label">Summary</span>
                  <p>{entry.aras_summary}</p>
                </div>
              {/if}
            </div>
          {/if}

          {#if !isFinished && entry.content_raw}
            <div class="ai-actions">
              <button class="btn btn-sm" onclick={refineWithAI} disabled={refining}>
                {refining ? 'Refining...' : 'Refine with AI'}
              </button>
              <button class="btn btn-sm" onclick={generateARAS} disabled={generatingAras}>
                {generatingAras ? 'Generating...' : 'Generate ARAS'}
              </button>
            </div>
          {/if}
        {:else}
          <div class="empty-state-box">
            <p class="empty-state-text">No entry for this date yet.</p>
            <button class="btn btn-sm btn-primary" onclick={enterEditMode}>
              Create Entry
            </button>
          </div>
        {/if}

        <div class="section events-section">
          <h4>Events</h4>
          {#if dayEvents.length > 0}
            <div class="events-list">
              {#each dayEvents as ev}
                <div class="event-item">
                  <div class="event-item-header">
                    <span class="event-tag event-tag-{ev.type}">{ev.type}</span>
                    <span class="event-title">{ev.title}</span>
                    {#if !isFinished}
                      <button class="event-edit-btn" onclick={() => { editingEvent = ev; showEventForm = true; }}>Edit</button>
                    {/if}
                  </div>
                  {#if ev.start_time || ev.end_time}
                    <span class="event-time">
                      {ev.start_time?.slice(0, 5) || '–'} – {ev.end_time?.slice(0, 5) || '–'}
                    </span>
                  {/if}
                  {#if ev.description}
                    <p class="event-desc">{ev.description}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="no-events-text">No events scheduled</p>
          {/if}
        </div>

      {:else if mode === 'edit'}
        <div class="editor">
          <div class="field">
            <label class="label" for="hours-input">Hours Rendered</label>
            <input
              id="hours-input"
              class="input"
              class:invalid={hoursError}
              type="number"
              min="0"
              max="24"
              step="0.5"
              bind:value={hours}
              placeholder="0"
              onfocus={() => (hoursError = '')}
            />
            {#if hoursError}
              <p class="field-error" role="alert">{hoursError}</p>
            {:else}
              <p class="field-hint">Enter 0–24 hours for this day</p>
            {/if}
          </div>
          <div class="field">
            <label class="label" for="content-input">Journal Content</label>
            <textarea
              id="content-input"
              class="textarea"
              rows="8"
              bind:value={contentRaw}
              placeholder="Describe your tasks, challenges, learnings, and reflections..."
            ></textarea>
            <p class="field-hint">Optional. Add notes for AI refine and ARAS.</p>
          </div>
          <div class="editor-actions">
            <button class="btn btn-primary" onclick={saveEntry}>Save</button>
            <button class="btn" onclick={requestModeView}>Cancel</button>
          </div>
        </div>

      {:else if mode === 'log-hours'}
        <div class="editor">
          <div class="field">
            <label class="label" for="log-hours-input">Hours to Log</label>
            <input
              id="log-hours-input"
              class="input"
              class:invalid={hoursError}
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              bind:value={hours}
              placeholder="8"
              onfocus={() => (hoursError = '')}
            />
            {#if hoursError}
              <p class="field-error" role="alert">{hoursError}</p>
            {:else}
              <p class="field-hint">Minimum 0.5, maximum 24 hours per day</p>
            {/if}
          </div>
          <div class="editor-actions">
            <button class="btn btn-primary" onclick={logHoursOnly}>Log Hours</button>
            <button class="btn" onclick={requestModeView}>Cancel</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .modal-header {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .modal-header h2 {
    font-size: 1.3rem;
    margin-bottom: 0.5rem;
    padding-right: 2rem;
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .hours-badge {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--dark-soft);
  }

  .close-btn {
    position: absolute;
    top: 0;
    right: 0;
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--dark-soft);
    cursor: pointer;
    line-height: 1;
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius);
    transition: color 0.2s ease, background 0.2s ease, transform 0.2s var(--ease-out);
  }
  .close-btn:hover {
    color: var(--red);
    background: rgba(190, 53, 25, 0.08);
    transform: scale(1.05);
  }

  .confirm-dialog {
    text-align: center;
    padding: 1rem 0;
    animation: fadeIn 0.2s var(--ease-out);
  }
  .confirm-icon {
    color: var(--red);
    margin-bottom: 1rem;
  }
  .confirm-dialog h3 {
    font-size: 1.15rem;
    margin-bottom: 0.5rem;
  }
  .confirm-dialog p {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--dark-soft);
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }
  .confirm-actions {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }
  .confirm-actions .btn {
    min-width: 120px;
    justify-content: center;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section h4 {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dark-soft);
    margin-bottom: 0.5rem;
  }

  .events-section {
    border-top: 1px solid var(--border-light);
    padding-top: 1rem;
  }
  .events-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .event-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border-light);
  }
  .event-item:last-child {
    border-bottom: none;
  }
  .event-item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .event-tag {
    font-family: var(--font-ui);
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.15rem 0.4rem;
    flex-shrink: 0;
  }
  .event-tag-meeting { background: var(--red); color: var(--bg); }
  .event-tag-deadline { background: var(--dark); color: var(--bg); }
  .event-tag-reminder { background: var(--warning); color: var(--bg); }
  .event-tag-personal { background: rgba(190, 53, 25, 0.12); color: var(--red); }
  .event-title {
    font-family: var(--font-body);
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--dark);
    flex: 1;
  }
  .event-edit-btn {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: none;
    border: 1px solid var(--border);
    color: var(--dark-soft);
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }
  .event-edit-btn:hover {
    border-color: var(--red);
    color: var(--red);
  }
  .event-time {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--dark-soft);
    margin-top: 0.15rem;
  }
  .event-desc {
    font-size: 0.8rem;
    color: var(--dark-soft);
    margin-top: 0.25rem;
    line-height: 1.5;
  }
  .no-events-text {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
    font-style: italic;
  }

  .entry-content {
    font-size: 0.95rem;
    line-height: 1.7;
    white-space: pre-wrap;
  }

  .entry-content.refined {
    color: var(--dark-soft);
    font-style: italic;
    border-left: 3px solid var(--red);
    padding-left: 1rem;
  }

  .aras-sections h4 {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dark-soft);
    margin-bottom: 0.75rem;
  }

  .aras-block {
    margin-bottom: 1rem;
    padding-left: 1rem;
    border-left: 2px solid var(--border);
  }

  .aras-label {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--red);
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .aras-block p {
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .ai-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .empty-state-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2.5rem 0;
  }
  .empty-state-text {
    color: var(--dark-soft);
    font-style: italic;
    font-size: 0.95rem;
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .editor-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .loading-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    color: var(--dark-soft);
    padding: 3rem 0;
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

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @media (max-width: 768px) {
    .modal-header h2 {
      font-size: 1.15rem;
      padding-right: 2rem;
    }
    .action-buttons {
      gap: 0.4rem;
      margin-bottom: 1.25rem;
    }
    .action-buttons .btn {
      flex: 1;
      min-width: 0;
      justify-content: center;
    }
    .entry-content { font-size: 0.9rem; }
    .aras-block p { font-size: 0.85rem; }
    .editor-actions { flex-wrap: wrap; }
    .editor-actions .btn { flex: 1; min-width: 120px; }
  }

  @media (max-width: 480px) {
    .modal-header { margin-bottom: 1.25rem; }
    .modal-header h2 { font-size: 1.05rem; padding-right: 1.75rem; }
    .header-meta { flex-wrap: wrap; gap: 0.5rem; }
    .action-buttons { flex-direction: column; margin-bottom: 1rem; }
    .action-buttons .btn { width: 100%; }
    .section h4, .aras-sections h4 { font-size: 0.7rem; }
    .entry-content { font-size: 0.85rem; }
    .aras-block { padding-left: 0.75rem; }
    .aras-block p { font-size: 0.8rem; }
    .ai-actions { flex-direction: column; }
    .ai-actions .btn { width: 100%; justify-content: center; }
    .editor-actions { flex-direction: column; }
    .editor-actions .btn { width: 100%; }
    .confirm-actions { flex-direction: column; }
    .confirm-actions .btn { width: 100%; }
  }
</style>
