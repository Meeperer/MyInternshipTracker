<script>
  import AuthShell from '$components/AuthShell.svelte';
  import Calendar from '$components/Calendar.svelte';
  import DayModal from '$components/DayModal.svelte';

  let selectedDate = $state(null);

  function handleDateSelect(date) {
    selectedDate = date;
  }

  function handleQuickAction(date) {
    selectedDate = date;
  }

  function closeModal() {
    selectedDate = null;
  }
</script>

<AuthShell>
  <div class="calendar-page-shell">
    <Calendar onDateSelect={handleDateSelect} onQuickAction={handleQuickAction} />
  </div>
</AuthShell>

{#if selectedDate}
  <DayModal date={selectedDate} onClose={closeModal} />
{/if}

<style>
  .calendar-page-shell {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    display: flex;
    overflow: hidden;
  }

  :global(html),
  :global(body) {
    overflow: hidden;
  }

  :global(.app-shell) {
    height: 100dvh;
    max-height: 100dvh;
    overflow: hidden;
  }

  :global(main#main-content) {
    flex: 1 1 auto;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
</style>
