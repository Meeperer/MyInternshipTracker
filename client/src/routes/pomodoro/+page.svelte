<script>
  import AuthShell from '$components/AuthShell.svelte';
  import Timer from '$components/Timer.svelte';
</script>

<AuthShell>
  <div class="pomodoro-wrap">
    <Timer />
  </div>
</AuthShell>

<style>
  .pomodoro-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    justify-content: center;
  }
</style>
