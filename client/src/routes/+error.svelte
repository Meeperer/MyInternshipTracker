<script>
  import { page } from '$app/stores';
  const message = $derived($page.error?.message ?? 'Something went wrong.');
</script>

<div class="error-page">
  <h1>Error</h1>
  <p>{message}</p>
  <a href="/" class="btn btn-primary">Go to home</a>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    gap: 1rem;
    text-align: center;
  }
  .error-page h1 {
    font-size: 1.5rem;
    color: var(--red);
  }
  .error-page p {
    font-family: var(--font-ui);
    color: var(--dark-soft);
    max-width: 28rem;
  }
</style>
