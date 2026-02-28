<script>
  let { progress = 0, durationSeconds = 10 } = $props();
</script>

<div class="loading-screen" role="status" aria-live="polite" aria-label="Loading application">
  <div class="loading-content">
    <h1 class="loading-title">Internship Tracker</h1>
    <p class="loading-subtitle">Preparing your workspace</p>

    <div class="spinner-wrap">
      <div class="spinner" aria-hidden="true"></div>
    </div>

    <div class="progress-wrap">
      <div class="progress-track">
        <div
          class="progress-fill"
          style="width: {Math.min(progress, 100)}%"
        ></div>
      </div>
      <span class="progress-label">{Math.round(progress)}%</span>
    </div>

    <p class="loading-hint">Loading...</p>
  </div>

  <div class="loading-bg" aria-hidden="true"></div>
</div>

<style>
  .loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    z-index: 9999;
    overflow: hidden;
  }

  .loading-bg {
    position: absolute;
    inset: 0;
    background: var(--bg);
    opacity: 0.97;
  }

  .loading-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    padding: 2rem;
    max-width: 320px;
    width: 100%;
  }

  .loading-title {
    font-family: var(--font-display);
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    color: var(--red);
    margin: 0;
    text-align: center;
    width: 100%;
    animation: titleFadeIn 0.8s var(--ease-out) both;
  }

  .loading-subtitle {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--dark-soft);
    margin: 0;
    letter-spacing: 0.02em;
    animation: subtitleFadeIn 0.6s 0.2s var(--ease-out) both;
  }

  .spinner-wrap {
    margin: 0.5rem 0;
    animation: spinnerFadeIn 0.5s 0.4s var(--ease-out) both;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-light);
    border-top-color: var(--red);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  .progress-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    animation: progressFadeIn 0.5s 0.6s var(--ease-out) both;
  }

  .progress-track {
    width: 100%;
    height: 8px;
    background: var(--border-light);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--red);
    border-radius: 4px;
    transition: width 0.15s linear;
  }

  .progress-label {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--dark-soft);
    letter-spacing: 0.05em;
  }

  .loading-hint {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--dark-soft);
    margin: 0;
  }

  @keyframes titleFadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes subtitleFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spinnerFadeIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes progressFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
