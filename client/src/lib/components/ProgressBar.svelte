<script>
  import { TARGET_HOURS } from '$lib/constants.js';
  let { percentage = 0, total = 0, target = TARGET_HOURS } = $props();
  const checkpoints = [25, 50, 75, 100];
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
    <div class="progress-checkpoints" aria-hidden="true">
      {#each checkpoints as checkpoint}
        <span class="progress-checkpoint" style={`left: ${checkpoint}%`}></span>
      {/each}
    </div>
  </div>
  <div class="progress-footer">
    <span>{Math.max(0, target - total)} hours to go</span>
    <span>{percentage >= 100 ? 'Requirement complete' : 'Steady forward progress'}</span>
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
    position: relative;
    width: 100%;
    height: clamp(10px, 1.25vw, 14px);
    background: var(--border-light);
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-fill {
    position: relative;
    height: 100%;
    background: var(--red);
    border-radius: 5px;
    transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease;
    overflow: hidden;
  }

  .progress-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    transform: translateX(-100%);
    animation: progressShimmer 1.8s linear infinite;
  }

  .progress-fill.completed {
    background: var(--success);
  }

  .progress-checkpoints {
    position: absolute;
    inset: 0;
  }

  .progress-checkpoint {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 18px;
    background: rgba(255, 255, 255, 0.68);
    transform: translate(-50%, -50%);
    border-radius: 999px;
  }

  .progress-footer {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.55rem;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    color: var(--dark-soft);
  }

  @keyframes progressShimmer {
    100% {
      transform: translateX(100%);
    }
  }

  @media (max-width: 768px) {
    .progress-label,
    .progress-pct,
    .progress-footer {
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
    .progress-footer {
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.68rem;
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
