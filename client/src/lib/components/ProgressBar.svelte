<script>
  import { TARGET_HOURS } from '$lib/constants.js';
  let { percentage = 0, total = 0, target = TARGET_HOURS } = $props();
</script>

<div class="progress-container">
  <div class="progress-header">
    <span class="progress-label">{total} / {target} hours</span>
    <span class="progress-pct">{percentage}%</span>
  </div>
  <div class="progress-track">
    <div
      class="progress-fill"
      class:completed={percentage >= 100}
      style="width: {Math.min(percentage, 100)}%"
    ></div>
  </div>
</div>

<style>
  .progress-container {
    width: 100%;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .progress-label {
    font-family: var(--font-ui);
    font-size: clamp(0.8rem, 1vw, 0.95rem);
    color: var(--dark-soft);
    letter-spacing: 0.02em;
  }

  .progress-pct {
    font-family: var(--font-display);
    font-size: clamp(0.8rem, 1vw, 0.95rem);
    color: var(--red);
    font-weight: 600;
  }

  .progress-track {
    width: 100%;
    height: clamp(10px, 1.25vw, 14px);
    background: var(--border-light);
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--red);
    border-radius: 5px;
    transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease;
  }

  .progress-fill.completed {
    background: var(--success);
  }

  @media (max-width: 768px) {
    .progress-label,
    .progress-pct {
      font-size: 0.75rem;
    }
    .progress-track {
      height: 8px;
    }
  }

  @media (max-width: 480px) {
    .progress-header {
      margin-bottom: 0.3rem;
    }
    .progress-label,
    .progress-pct {
      font-size: 0.7rem;
    }
    .progress-track {
      height: 6px;
      border-radius: 3px;
    }
    .progress-fill {
      border-radius: 3px;
    }
  }
</style>
