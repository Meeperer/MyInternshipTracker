<script>
  import { isAuthenticated } from '$stores/auth.js';
  import { progress } from '$stores/progress.js';
  import { journal } from '$stores/journal.js';
  import { selectedMonth } from '$stores/selectedMonth.js';
  import AuthShell from '$components/AuthShell.svelte';
  import JournalList from '$components/JournalList.svelte';
  import DayModal from '$components/DayModal.svelte';
  import { parseMonthValue } from '$utils/date.js';

  let selectedDate = $state(null);

  function handleDateSelect(date) {
    selectedDate = date;
  }

  function closeModal() {
    selectedDate = null;
    progress.fetch();
    const { year, month } = parseMonthValue($selectedMonth);
    journal.fetchMonth(year, month);
  }
</script>

<AuthShell>
  <JournalList onDateSelect={handleDateSelect} />
</AuthShell>

{#if selectedDate}
  <DayModal date={selectedDate} onClose={closeModal} />
{/if}
