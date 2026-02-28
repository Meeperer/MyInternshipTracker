<script>
  import { toast } from '$stores/toast.js';
</script>

{#if $toast}
  <div class="toast toast-{$toast.type}" role="alert">
    <span class="toast-accent" aria-hidden="true"></span>
    <span class="toast-message">{$toast.message}</span>
    <button type="button" class="toast-dismiss" onclick={() => toast.clear()} aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M2 2l10 10M12 2L2 12" />
      </svg>
    </button>
  </div>
{/if}
