<script>
  import { tick } from 'svelte';
  import { journal } from '$stores/journal.js';
  import { events } from '$stores/events.js';
  import { toast } from '$stores/toast.js';
  import { formatDateLong } from '$utils/date.js';
  import {
    clearOfflineDraft,
    hasMeaningfulOfflineDraft,
    loadOfflineDraft,
    saveOfflineDraft
  } from '$utils/offlineDrafts.js';
  import EventForm from './EventForm.svelte';

  let { date = '', intent = 'view', onClose = () => {} } = $props();

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
  let savingEntry = $state(false);
  let loggingHours = $state(false);
  let quickCompleting = $state(false);
  let quickAction = $state('');
  let quickSavedPulse = $state(false);
  let quickSaveMessage = $state('Ready');
  let finishing = $state(false);
  let hoursError = $state('');
  let initialHoursOnEdit = $state('');
  let initialContentOnEdit = $state('');
  let modalContentEl = $state(null);
  let quickHoursInputEl = $state(null);
  let previousActiveElement = $state(null);
  let autoSaveStatus = $state('');
  let autoSaveTimer = null;
  let localDraftTimer = null;
  let quickSavedPulseTimer = null;
  let online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  let draftRecovery = $state(null);

  const MIN_SAVE_FEEDBACK_MS = 420;

  const isDirty = $derived(
    (mode === 'edit' && (hours !== initialHoursOnEdit || contentRaw !== initialContentOnEdit)) ||
    (mode === 'log-hours' && hours !== initialHoursOnEdit) ||
    (mode === 'quick' && (hours !== initialHoursOnEdit || contentRaw !== initialContentOnEdit))
  );

  $effect(() => {
    if (mode !== 'edit' || !isDirty) {
      return () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
      };
    }

    if (!online) {
      autoSaveStatus = 'offline-saved';
      persistLocalDraft(true);
      return () => {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
      };
    }

    if (entry) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveStatus = 'unsaved';
      autoSaveTimer = setTimeout(async () => {
        try {
          autoSaveStatus = 'saving';
          const result = await journal.save({
            date,
            hours: parseFloat(hours) || 0,
            content_raw: contentRaw
          });
          entry = result;
          clearOfflineDraft(date);
          draftRecovery = null;
          initialHoursOnEdit = hours;
          initialContentOnEdit = contentRaw;
          autoSaveStatus = 'saved';
          setTimeout(() => { if (autoSaveStatus === 'saved') autoSaveStatus = ''; }, 2000);
        } catch {
          autoSaveStatus = 'offline-saved';
          persistLocalDraft(true);
        }
      }, 1200);
    }
    return () => { if (autoSaveTimer) clearTimeout(autoSaveTimer); };
  });

  $effect(() => {
    if (!date || (mode !== 'edit' && mode !== 'log-hours' && mode !== 'quick')) {
      return () => {
        if (localDraftTimer) clearTimeout(localDraftTimer);
      };
    }

    if (localDraftTimer) clearTimeout(localDraftTimer);
    localDraftTimer = setTimeout(() => {
      const shouldPersist = hasMeaningfulOfflineDraft({
        hours,
        content_raw: contentRaw
      });

      if (!shouldPersist) {
        if (!draftRecovery?.unsynced) {
          clearOfflineDraft(date);
        }
        return;
      }

      saveOfflineDraft(date, {
        hours,
        content_raw: contentRaw,
        mode,
        unsynced: !online || autoSaveStatus === 'offline-saved'
      });
    }, 350);

    return () => {
      if (localDraftTimer) clearTimeout(localDraftTimer);
    };
  });

  $effect(() => {
    if (date) {
      if (typeof document !== 'undefined') previousActiveElement = document.activeElement;
      loadEntry();
    }
  });

  $effect(() => {
    if (typeof window === 'undefined') return;

    function syncOnlineStatus() {
      online = navigator.onLine;
    }

    syncOnlineStatus();
    window.addEventListener('online', syncOnlineStatus);
    window.addEventListener('offline', syncOnlineStatus);

    return () => {
      window.removeEventListener('online', syncOnlineStatus);
      window.removeEventListener('offline', syncOnlineStatus);
    };
  });

  $effect(() => {
    return () => {
      if (quickSavedPulseTimer) clearTimeout(quickSavedPulseTimer);
    };
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function withSaveFeedback(promise) {
    const [result] = await Promise.all([promise, delay(MIN_SAVE_FEEDBACK_MS)]);
    return result;
  }

  function showQuickSaved(message) {
    quickSaveMessage = message;
    quickSavedPulse = true;
    if (quickSavedPulseTimer) clearTimeout(quickSavedPulseTimer);
    quickSavedPulseTimer = setTimeout(() => {
      quickSavedPulse = false;
      quickSaveMessage = 'Ready';
      quickSavedPulseTimer = null;
    }, 1600);
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
    const [loadedEntry, loadedEvents] = await Promise.all([
      journal.fetchDate(date),
      events.fetchDate(date)
    ]);
    entry = loadedEntry;
    dayEvents = loadedEvents;
    showEventForm = false;
    editingEvent = null;
    if (entry) {
      hours = String(entry.hours || '');
      contentRaw = entry.content_raw || '';
    } else {
      hours = '';
      contentRaw = '';
    }
    mode = intent === 'quick' && entry?.status !== 'finished' ? 'quick' : 'view';
    initialHoursOnEdit = hours;
    initialContentOnEdit = contentRaw;
    hydrateDraftRecovery();
    loading = false;
    if (mode === 'quick') {
      await tick();
      quickHoursInputEl?.focus();
      quickHoursInputEl?.select();
    }
  }

  function persistLocalDraft(unsynced = !online) {
    if (!date) return null;

    const shouldPersist = hasMeaningfulOfflineDraft({
      hours,
      content_raw: contentRaw
    });

    if (!shouldPersist) {
      clearOfflineDraft(date);
      return null;
    }

    const draft = saveOfflineDraft(date, {
      hours,
      content_raw: contentRaw,
      mode,
      unsynced
    });

    draftRecovery = draft;
    return draft;
  }

  function hydrateDraftRecovery() {
    const draft = loadOfflineDraft(date);

    if (!hasMeaningfulOfflineDraft(draft)) {
      draftRecovery = null;
      clearOfflineDraft(date);
      return;
    }

    const normalizedHours = String(entry?.hours ?? '').trim();
    const normalizedContent = String(entry?.content_raw ?? '').trim();
    const draftHours = String(draft?.hours ?? '').trim();
    const draftContent = String(draft?.content_raw ?? '').trim();
    const matchesEntry = normalizedHours === draftHours && normalizedContent === draftContent;

    if (matchesEntry && !draft.unsynced) {
      draftRecovery = null;
      clearOfflineDraft(date);
      return;
    }

    draftRecovery = draft;
  }

  function restoreOfflineDraft() {
    if (!draftRecovery) return;

    hours = String(draftRecovery.hours ?? '');
    contentRaw = draftRecovery.content_raw || '';
    initialHoursOnEdit = hours;
    initialContentOnEdit = contentRaw;
    mode = ['quick', 'log-hours'].includes(draftRecovery.mode) ? draftRecovery.mode : 'edit';
    autoSaveStatus = draftRecovery.unsynced ? 'offline-saved' : 'saved';
    entry = {
      ...(entry || {}),
      date,
      hours: parseFloat(hours) || 0,
      content_raw: contentRaw,
      status: entry?.status || 'draft',
      local_only: draftRecovery.unsynced
    };
    toast.success(draftRecovery.unsynced ? 'Offline draft restored' : 'Local draft restored');
  }

  function dismissOfflineDraft() {
    clearOfflineDraft(date);
    draftRecovery = null;
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
    savingEntry = true;

    if (!online) {
      const draft = persistLocalDraft(true);
      initialHoursOnEdit = hours;
      initialContentOnEdit = contentRaw;
      autoSaveStatus = 'offline-saved';
      mode = 'view';
      entry = {
        ...(entry || {}),
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw,
        status: entry?.status || 'draft',
        local_only: true
      };
      draftRecovery = draft;
      toast.success('Draft saved locally for offline use');
      savingEntry = false;
      return;
    }

    try {
      const result = await withSaveFeedback(journal.save({
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw
      }));
      entry = result;
      clearOfflineDraft(date);
      draftRecovery = null;
      mode = 'view';
      toast.success('Entry saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      savingEntry = false;
    }
  }

  async function logHoursOnly() {
    if (!validateHours(false)) return;
    loggingHours = true;

    if (!online) {
      const draft = persistLocalDraft(true);
      initialHoursOnEdit = hours;
      autoSaveStatus = 'offline-saved';
      mode = 'view';
      entry = {
        ...(entry || {}),
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw || entry?.content_raw || '',
        status: entry?.status || 'draft',
        local_only: true
      };
      draftRecovery = draft;
      toast.success('Hours saved locally for offline use');
      loggingHours = false;
      return;
    }

    try {
      const result = await withSaveFeedback(journal.logHours(date, parseFloat(hours)));
      entry = result;
      clearOfflineDraft(date);
      draftRecovery = null;
      toast.success('Hours logged');
      mode = 'view';
    } catch (err) {
      toast.error(err.message);
    } finally {
      loggingHours = false;
    }
  }

  async function saveQuickEntry({ finish = false } = {}) {
    if (!validateHours(!finish)) return;

    if (!online) {
      const draft = persistLocalDraft(true);
      initialHoursOnEdit = hours;
      initialContentOnEdit = contentRaw;
      autoSaveStatus = 'offline-saved';
      entry = {
        ...(entry || {}),
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw,
        status: entry?.status || 'draft',
        local_only: true
      };
      draftRecovery = draft;
      toast.success(finish ? 'Saved locally. Finish when back online.' : 'Draft saved locally');
      return;
    }

    quickCompleting = true;
    quickAction = finish ? 'finish' : 'draft';
    quickSaveMessage = finish ? 'Finishing day...' : 'Saving draft...';
    quickSavedPulse = false;

    try {
      const payload = {
        date,
        hours: parseFloat(hours) || 0,
        content_raw: contentRaw
      };
      const result = await withSaveFeedback(
        finish ? journal.completeDay(payload) : journal.save(payload)
      );
      entry = result;
      clearOfflineDraft(date);
      draftRecovery = null;
      initialHoursOnEdit = String(result.hours || '');
      initialContentOnEdit = result.content_raw || '';
      hours = String(result.hours || '');
      contentRaw = result.content_raw || '';
      showQuickSaved(finish ? 'Day finished' : 'Draft saved');
      toast.success(finish ? 'Day finished' : 'Entry saved');

      if (finish) {
        setTimeout(() => {
          returnFocus();
          onClose();
        }, 420);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      quickCompleting = false;
      quickAction = '';
    }
  }

  async function finishDay() {
    confirmingFinish = true;
  }

  async function confirmFinishDay() {
    confirmingFinish = false;
    finishing = true;
    try {
      const result = await withSaveFeedback(journal.finishDay(date));
      entry = result;
      clearOfflineDraft(date);
      draftRecovery = null;
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
    !entry ? 'Not Started' : entry.local_only ? 'Saved Offline' : entry.status === 'finished' ? 'Finished' : 'In Progress'
  );
  let statusClass = $derived(
    !entry ? '' : entry.local_only ? 'badge-offline' : entry.status === 'finished' ? 'badge-finished' : 'badge-draft'
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
          <span class:offline={!online} class="connectivity-chip">
            {online ? 'Online' : 'Offline mode'}
          </span>
          {#if entry}
            <span class="hours-badge">{entry.hours} {Number(entry.hours) === 1 ? 'hour' : 'hours'}</span>
          {/if}
        </div>
        <button class="close-btn" onclick={requestClose} aria-label="Close">&times;</button>
      </div>

      {#if draftRecovery}
        <div class="draft-recovery card" role="status" aria-live="polite">
          <div class="draft-recovery-copy">
            <strong>{draftRecovery.unsynced ? 'Offline draft available' : 'Saved local draft available'}</strong>
            <p>
              {draftRecovery.unsynced
                ? 'A local copy of this entry is waiting on this device. Restore it whenever you are ready to keep writing.'
                : 'A saved local draft exists for this date if you want to bring it back into the editor.'}
            </p>
          </div>
          <div class="draft-recovery-actions">
            <button class="btn btn-sm btn-primary" onclick={restoreOfflineDraft}>Restore draft</button>
            <button class="btn btn-sm" onclick={dismissOfflineDraft}>Dismiss</button>
          </div>
        </div>
      {/if}

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
            <button class="btn btn-primary save-button" class:is-saving={finishing} onclick={confirmFinishDay} disabled={finishing}>
              {#if finishing}
                <span class="button-spinner" aria-hidden="true"></span>
              {/if}
              {finishing ? 'Finishing' : 'Finish Day'}
            </button>
          </div>
        </div>
      {:else if mode === 'quick'}
        <div class="quick-log-panel">
          <div class="quick-log-head">
            <div>
              <h3>Quick log</h3>
              <p>Hours, note, done.</p>
            </div>
            {#if entry?.hours > 0 || entry?.content_raw}
              <button class="quick-mode-link" type="button" onclick={() => (mode = 'view')}>Details</button>
            {/if}
          </div>

          <div class="quick-log-grid">
            <div class="field quick-hours-field">
              <label class="label" for="quick-hours-input">Hours</label>
              <input
                id="quick-hours-input"
                bind:this={quickHoursInputEl}
                class="input quick-hours-input"
                class:invalid={hoursError}
                type="number"
                min="0"
                max="24"
                step="0.5"
                bind:value={hours}
                placeholder="8"
                onfocus={() => (hoursError = '')}
              />
              {#if hoursError}
                <p class="field-error" role="alert">{hoursError}</p>
              {:else}
                <p class="field-hint">Use 0 for a note-only draft.</p>
              {/if}
            </div>

            <div class="field quick-notes-field">
              <label class="label" for="quick-content-input">Journal</label>
              <textarea
                id="quick-content-input"
                class="textarea quick-textarea"
                rows="6"
                bind:value={contentRaw}
                placeholder="What moved today?"
              ></textarea>
            </div>
          </div>

          <div class="quick-actions">
            <button
              class="btn save-button"
              class:is-saving={quickCompleting && quickAction === 'draft'}
              type="button"
              onclick={() => saveQuickEntry()}
              disabled={quickCompleting}
            >
              {#if quickCompleting && quickAction === 'draft'}
                <span class="button-spinner" aria-hidden="true"></span>
              {/if}
              {quickCompleting && quickAction === 'draft' ? 'Saving' : 'Save draft'}
            </button>
            <button
              class="btn btn-primary save-button"
              class:is-saving={quickCompleting && quickAction === 'finish'}
              type="button"
              onclick={() => saveQuickEntry({ finish: true })}
              disabled={quickCompleting}
            >
              {#if quickCompleting && quickAction === 'finish'}
                <span class="button-spinner" aria-hidden="true"></span>
              {/if}
              {quickCompleting && quickAction === 'finish' ? 'Finishing' : 'Save & finish'}
            </button>
          </div>

          <div
            class="save-status-line"
            class:active={quickCompleting}
            class:done={quickSavedPulse}
            role="status"
            aria-live="polite"
          >
            <span class="save-status-dot" aria-hidden="true"></span>
            <span>
              {quickCompleting
                ? quickSaveMessage
                : quickSavedPulse
                  ? quickSaveMessage
                  : 'Ready to save'}
            </span>
          </div>

          <div class="quick-secondary-actions">
            <button class="quick-mode-link" type="button" onclick={() => { showEventForm = true; editingEvent = null; }}>
              Add event
            </button>
            <button class="quick-mode-link" type="button" onclick={enterEditMode}>
              Full editor
            </button>
          </div>
        </div>
      {:else if mode === 'view'}
        <div class="action-buttons">
          {#if !isFinished}
            <button class="btn btn-sm btn-primary" onclick={() => (mode = 'quick')}>
              Quick Log
            </button>
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
              <button class="btn btn-sm" onclick={refineWithAI} disabled={refining || entry.local_only}>
                {refining ? 'Refining...' : 'Refine'}
              </button>
              <button class="btn btn-sm" onclick={generateARAS} disabled={generatingAras || entry.local_only}>
                {generatingAras ? 'Generating...' : 'ARAS'}
              </button>
            </div>
          {/if}
        {:else}
          <div class="empty-state-box">
            <img
              class="botanical-cutout modal-empty-plant"
              src="/plants/monstera-pot.png"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
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
                      {ev.start_time?.slice(0, 5) || '-'} - {ev.end_time?.slice(0, 5) || '-'}
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
            <label class="label" for="hours-input">Hours</label>
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
              <p class="field-hint">0-24 hours</p>
            {/if}
          </div>
          <div class="field">
            <label class="label" for="content-input">Notes</label>
            <textarea
              id="content-input"
              class="textarea"
              rows="8"
              bind:value={contentRaw}
              placeholder="Tasks, blockers, wins..."
            ></textarea>
            <p class="field-hint">Optional.</p>
          </div>
          <div class="editor-footer">
            {#if autoSaveStatus}
              <span class="autosave-status" class:saving={autoSaveStatus === 'saving'} class:saved={autoSaveStatus === 'saved'} class:error={autoSaveStatus === 'error'} class:offline={autoSaveStatus === 'offline-saved'}>
                {#if autoSaveStatus === 'unsaved'}Unsaved changes
                {:else if autoSaveStatus === 'saving'}Auto-saving...
                {:else if autoSaveStatus === 'saved'}Draft saved
                {:else if autoSaveStatus === 'offline-saved'}Saved offline
                {:else if autoSaveStatus === 'error'}Save failed
                {/if}
              </span>
            {/if}
            <div class="editor-actions">
              <button class="btn btn-primary save-button" class:is-saving={savingEntry} onclick={saveEntry} disabled={savingEntry}>
                {#if savingEntry}
                  <span class="button-spinner" aria-hidden="true"></span>
                {/if}
                {savingEntry ? 'Saving...' : 'Save'}
              </button>
              <button class="btn" onclick={requestModeView}>Cancel</button>
            </div>
          </div>
        </div>

      {:else if mode === 'log-hours'}
        <div class="editor">
          <div class="field">
            <label class="label" for="log-hours-input">Hours</label>
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
              <p class="field-hint">0.5-24 hours</p>
            {/if}
          </div>
          <div class="editor-actions">
            <button class="btn btn-primary save-button" class:is-saving={loggingHours} onclick={logHoursOnly} disabled={loggingHours}>
              {#if loggingHours}
                <span class="button-spinner" aria-hidden="true"></span>
              {/if}
              {loggingHours ? 'Logging...' : 'Log Hours'}
            </button>
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
    flex-wrap: wrap;
  }

  .hours-badge {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--dark-soft);
  }

  .badge-offline {
    background: rgba(89, 107, 64, 0.16);
    color: var(--warning);
  }

  .connectivity-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(45, 122, 58, 0.12);
    color: var(--success);
    font-family: var(--font-ui);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .connectivity-chip.offline {
    background: rgba(89, 107, 64, 0.16);
    color: var(--warning);
  }

  .draft-recovery {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 1rem 1.1rem;
    background: rgba(255, 251, 239, 0.92);
    border-color: rgba(89, 107, 64, 0.2);
    box-shadow: none;
  }

  .draft-recovery-copy {
    display: grid;
    gap: 0.3rem;
  }

  .draft-recovery-copy strong {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--red);
  }

  .draft-recovery-copy p {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--dark-soft);
    line-height: 1.55;
  }

  .draft-recovery-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
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
    background: rgba(11, 110, 58, 0.08);
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

  .quick-log-panel {
    display: grid;
    gap: 1rem;
  }

  .quick-log-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
  }

  .quick-log-head h3 {
    color: var(--canopy);
    font-size: clamp(1.5rem, 3vw, 2.1rem);
    line-height: 0.95;
  }

  .quick-log-head p {
    margin-top: 0.35rem;
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.88rem;
  }

  .quick-log-grid {
    display: grid;
    grid-template-columns: minmax(7rem, 0.34fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }

  .quick-hours-field {
    position: sticky;
    top: 0;
  }

  .quick-hours-input {
    min-height: 4.8rem;
    font-family: var(--font-display);
    font-size: 2.4rem;
    line-height: 1;
  }

  .quick-textarea {
    min-height: 9.5rem;
  }

  .quick-actions,
  .quick-secondary-actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .quick-actions {
    justify-content: flex-end;
    padding-top: 0.85rem;
    border-top: 1px solid rgba(36, 24, 15, 0.12);
  }

  .quick-secondary-actions {
    justify-content: space-between;
  }

  .quick-mode-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.35rem;
    padding: 0.42rem 0.7rem;
    border: 1px solid rgba(36, 24, 15, 0.28);
    border-radius: 6px;
    background: transparent;
    color: var(--canopy);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    transition: background 0.16s var(--ease-out), transform 0.16s var(--ease-out);
  }

  .quick-mode-link:hover {
    background: rgba(11, 110, 58, 0.08);
    transform: translateY(-1px);
  }

  .save-button {
    position: relative;
    overflow: hidden;
  }

  .save-button.is-saving {
    cursor: progress;
    box-shadow: 2px 2px 0 rgba(36, 24, 15, 0.12);
  }

  .save-button.is-saving::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(246, 239, 210, 0.34),
      transparent
    );
    animation: saveSweep 0.82s var(--ease-out) infinite;
  }

  .button-spinner {
    width: 0.95rem;
    height: 0.95rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: buttonSpin 0.62s linear infinite;
  }

  .save-status-line {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    justify-self: end;
    min-height: 1.8rem;
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .save-status-dot {
    width: 0.52rem;
    height: 0.52rem;
    border-radius: 50%;
    background: rgba(36, 24, 15, 0.34);
  }

  .save-status-line.active {
    color: var(--canopy);
  }

  .save-status-line.active .save-status-dot {
    background: var(--leaf);
    animation: savePulse 0.78s ease-in-out infinite;
  }

  .save-status-line.done {
    color: var(--leaf);
  }

  .save-status-line.done .save-status-dot {
    background: var(--leaf);
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
  .event-tag-personal { background: rgba(11, 110, 58, 0.12); color: var(--red); }
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

  .modal-empty-plant {
    width: min(8.5rem, 52vw);
    opacity: 0.78;
    filter: saturate(0.82) contrast(1.02) brightness(0.94);
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

  .editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.5rem;
    gap: 1rem;
  }

  .autosave-status {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--dark-soft);
    transition: color 0.2s ease;
  }

  .autosave-status.saving {
    color: var(--warning);
  }

  .autosave-status.saved {
    color: var(--success);
  }

  .autosave-status.offline {
    color: var(--warning);
  }

  .autosave-status.error {
    color: var(--red);
  }

  .editor-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
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

  .modal-header {
    padding-bottom: 0.9rem;
    border-bottom: 1px solid rgba(42, 34, 23, 0.12);
  }

  .close-btn,
  .event-edit-btn {
    border: 2px solid rgba(42, 34, 23, 0.72);
    border-radius: 6px;
    background: var(--paper-strong);
    color: var(--red);
  }

  .section,
  .aras-sections,
  .events-section,
  .empty-state-box,
  .confirm-dialog,
  .event-item,
  .aras-block {
    border-color: rgba(42, 34, 23, 0.16);
  }

  .event-tag,
  .connectivity-chip,
  .hours-badge {
    border-radius: 4px;
  }

  .entry-content,
  .aras-block p,
  .event-desc,
  .no-events-text {
    color: var(--dark-soft);
  }

  .modal-overlay {
    background: rgba(3, 28, 15, 0.68);
  }

  .modal-content {
    border: 2px solid rgba(36, 24, 15, 0.94);
    border-radius: 8px;
    background: var(--paper-strong);
    box-shadow: 8px 8px 0 rgba(36, 24, 15, 0.18);
  }

  .modal-header {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(36, 24, 15, 0.16);
  }

  .modal-header h2 {
    color: var(--canopy);
    font-size: clamp(1.3rem, 2vw, 1.75rem);
    line-height: 1.05;
  }

  .badge,
  .connectivity-chip,
  .hours-badge,
  .event-tag,
  .autosave-status {
    border-radius: 4px;
    font-family: var(--font-ui);
    font-weight: 800;
  }

  .hours-badge,
  .badge-draft {
    padding: 0.24rem 0.52rem;
    border: 1px solid rgba(36, 24, 15, 0.18);
    background: var(--pollen-soft);
    color: var(--soil);
  }

  .badge-finished,
  .connectivity-chip {
    background: var(--leaf);
    color: var(--cream);
  }

  .close-btn,
  .event-edit-btn {
    border: 2px solid rgba(36, 24, 15, 0.72);
    border-radius: 6px;
    background: var(--cream);
    color: var(--canopy);
  }

  .close-btn:hover,
  .event-edit-btn:hover {
    border-color: rgba(36, 24, 15, 0.92);
    background: var(--pollen);
    color: var(--canopy);
    transform: translate(-1px, -1px);
  }

  .action-buttons {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(36, 24, 15, 0.12);
  }

  .section,
  .aras-sections,
  .events-section {
    margin-bottom: 1rem;
  }

  .section h4,
  .aras-sections h4,
  .aras-label {
    color: var(--leaf);
  }

  .entry-content.refined,
  .aras-block {
    border-left-color: var(--pollen);
  }

  .event-item {
    padding: 0.75rem 0;
    border-bottom: 1px solid rgba(36, 24, 15, 0.12);
  }

  .event-tag-meeting,
  .event-tag-personal {
    background: var(--leaf);
    color: var(--cream);
  }

  .event-tag-deadline {
    background: var(--paprika);
    color: var(--cream);
  }

  .event-tag-reminder {
    background: var(--pollen);
    color: var(--soil);
  }

  .empty-state-box,
  .confirm-dialog,
  .draft-recovery {
    border: 2px solid rgba(36, 24, 15, 0.18);
    border-radius: 8px;
    background: rgba(216, 227, 184, 0.18);
    padding: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes buttonSpin {
    to { transform: rotate(360deg); }
  }

  @keyframes saveSweep {
    from { transform: translateX(-110%); }
    to { transform: translateX(110%); }
  }

  @keyframes savePulse {
    0%, 100% {
      opacity: 0.48;
      transform: scale(0.92);
    }
    50% {
      opacity: 1;
      transform: scale(1.14);
    }
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
    .draft-recovery {
      flex-direction: column;
      align-items: stretch;
    }
    .draft-recovery-actions {
      justify-content: stretch;
    }
    .draft-recovery-actions .btn {
      flex: 1;
      justify-content: center;
    }
    .quick-log-grid {
      grid-template-columns: 1fr;
    }
    .quick-hours-field {
      position: static;
    }
    .quick-actions .btn,
    .quick-secondary-actions .quick-mode-link {
      flex: 1;
    }
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
    .quick-log-head,
    .quick-actions,
    .quick-secondary-actions {
      flex-direction: column;
      align-items: stretch;
    }
    .quick-actions .btn,
    .quick-secondary-actions .quick-mode-link {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .save-button.is-saving::after,
    .button-spinner,
    .save-status-line.active .save-status-dot {
      animation: none;
    }
  }
</style>
