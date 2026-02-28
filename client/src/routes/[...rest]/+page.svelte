<script>
  import { goto } from '$app/navigation';
</script>

<div class="not-found">
  <h1>404</h1>
  <p>This page doesn't exist.</p>
  <a href="/" class="btn btn-primary">Go to home</a>
</div>

<style>
  .not-found {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 80vh;
    gap: 1rem;
    text-align: center;
  }
  .not-found h1 {
    font-size: 3rem;
    color: var(--red);
  }
  .not-found p {
    font-family: var(--font-ui);
    color: var(--dark-soft);
  }
</style>
