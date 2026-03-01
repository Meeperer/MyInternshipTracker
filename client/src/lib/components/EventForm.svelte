<script>
  import { events } from '$stores/events.js';
  import { toast } from '$stores/toast.js';

  let {
    date = '',
    event = null,
    onSave = () => {},
    onCancel = () => {},
    onDelete = () => {}
  } = $props();

  let title = $state(event?.title || '');
  let description = $state(event?.description || '');
  let startTime = $state(event?.start_time?.slice(0, 5) || '');
  let endTime = $state(event?.end_time?.slice(0, 5) || '');
  let type = $state(event?.type || 'personal');
  let reminderEnabled = $state(event?.reminder_enabled || false);
  let saving = $state(false);
  let deleting = $state(false);

  const isEditing = !!event;
  const EVENT_TYPES = [
    { value: 'meeting', label: 'Meeting' },
    { value: 'deadline', label: 'Deadline' },
    { value: 'reminder', label: 'Reminder' },
    { value: 'personal', label: 'Personal' }
  ];

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error('Event title is required');
      return;
    }
    if (startTime && endTime && startTime >= endTime) {
      toast.error('Start time must be before end time');
      return;
    }
    saving = true;
    try {
      const payload = {
        date,
        title: title.trim(),
        description: description.trim(),
        start_time: startTime || null,
        end_time: endTime || null,
        type,
        reminder_enabled: reminderEnabled
      };
      if (isEditing) {
        const result = await events.updateEvent(event.id, payload);
        toast.success('Event updated');
        onSave(result);
      } else {
        const result = await events.create(payload);
        toast.success('Event created');
        onSave(result);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this event?')) return;
    deleting = true;
    try {
      await events.deleteEvent(event.id);
      toast.success('Event deleted');
      onDelete(event.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      deleting = false;
    }
  }
</script>

<div class="event-form">
  <h4 class="form-title">{isEditing ? 'Edit Event' : 'New Event'}</h4>

  <div class="field">
    <label class="label" for="event-title">Title</label>
    <input id="event-title" class="input" type="text" bind:value={title} placeholder="Event title" maxlength="200" />
  </div>

  <div class="field">
    <label class="label">Type</label>
    <div class="type-selector">
      {#each EVENT_TYPES as t}
        <button
          type="button"
          class="type-btn"
          class:active={type === t.value}
          onclick={() => (type = t.value)}
        >
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field-row">
    <div class="field">
      <label class="label" for="event-start">Start Time</label>
      <input id="event-start" class="input" type="time" bind:value={startTime} />
    </div>
    <div class="field">
      <label class="label" for="event-end">End Time</label>
      <input id="event-end" class="input" type="time" bind:value={endTime} />
    </div>
  </div>

  <div class="field">
    <label class="label" for="event-desc">Description</label>
    <textarea id="event-desc" class="textarea" rows="3" bind:value={description} placeholder="Optional..." maxlength="2000"></textarea>
  </div>

  <label class="reminder-toggle">
    <input type="checkbox" bind:checked={reminderEnabled} />
    <span class="reminder-label">Enable Reminder</span>
  </label>

  <div class="form-actions">
    <button class="btn btn-primary" onclick={handleSubmit} disabled={saving}>
      {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
    </button>
    {#if isEditing}
      <button class="btn btn-danger" onclick={handleDelete} disabled={deleting}>Delete</button>
    {/if}
    <button class="btn" onclick={onCancel}>Cancel</button>
  </div>
</div>

<style>
  .event-form {
    animation: fadeIn 0.2s var(--ease-out);
  }
  .form-title {
    font-family: var(--font-display);
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: var(--red);
  }
  .field {
    margin-bottom: 0.75rem;
  }
  .field-row {
    display: flex;
    gap: 0.75rem;
  }
  .field-row .field {
    flex: 1;
  }
  .type-selector {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .type-btn {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--border);
    background: none;
    cursor: pointer;
    color: var(--dark-soft);
    transition: all 0.15s var(--ease-out);
  }
  .type-btn.active {
    background: var(--red);
    color: var(--bg);
    border-color: var(--red);
  }
  .reminder-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    cursor: pointer;
  }
  .reminder-toggle input {
    accent-color: var(--red);
  }
  .reminder-label {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
  }
  .form-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .btn-danger {
    background: none;
    border: 1px solid var(--red);
    color: var(--red);
  }
  .btn-danger:hover {
    background: var(--red);
    color: var(--bg);
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
