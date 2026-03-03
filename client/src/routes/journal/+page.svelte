<script>
  import { isAuthenticated } from '$stores/auth.js';
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import AuthShell from '$components/AuthShell.svelte';
  import JournalList from '$components/JournalList.svelte';
  import DayModal from '$components/DayModal.svelte';

  let selectedDate = $state(null);

  function handleDateSelect(date) {
    selectedDate = date;
  }

  function closeModal() {
    selectedDate = null;
    progress.fetch();
    const now = new Date();
    journal.fetchMonth(now.getFullYear(), now.getMonth() + 1);
  }
</script>

<AuthShell>
  <JournalList onDateSelect={handleDateSelect} />
</AuthShell>

{#if selectedDate}
  <DayModal date={selectedDate} onClose={closeModal} />
{/if}
