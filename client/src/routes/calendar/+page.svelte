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
  <Calendar onDateSelect={handleDateSelect} onQuickAction={handleQuickAction} />
</AuthShell>

{#if selectedDate}
  <DayModal date={selectedDate} onClose={closeModal} />
{/if}
