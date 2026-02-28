<script>
  import { timer } from '$stores/timer.js';

  const { display, state: timerState, baseMinutes } = timer;

  let durationInput = $state(25);

  $effect(() => {
    const mins = $baseMinutes;
    if (typeof mins === 'number' && !isNaN(mins)) {
      durationInput = Math.max(1, Math.min(180, mins));
    }
  });

  function setFromInput() {
    const n = parseInt(String(durationInput), 10);
    if (!isNaN(n)) {
      timer.setDuration(Math.max(1, Math.min(180, n)));
      durationInput = Math.max(1, Math.min(180, n));
    }
  }

  function handleStartPauseResume() {
    if ($timerState === 'stopped') {
      timer.start();
    } else if ($timerState === 'running') {
      timer.pause();
    } else {
      timer.start();
    }
  }

  const displayChars = $derived(($display || '00:00:00').split(''));

  /** Arc: center chars higher, ends lower – stronger curve to match reference image. */
  function arcOffset(i, total) {
    if (total <= 1) return 0;
    const t = i / (total - 1);
    const parabola = 4 * t * (1 - t);
    return (-0.24 * parabola).toFixed(3);
  }
</script>

<div class="pomodoro-view-old">
  <div class="timer-display-wrap">
    {#each displayChars as char, i}
      <span
        class="timer-char"
        class:colon={char === ':'}
        style="transform: translateY({arcOffset(i, displayChars.length)}em)"
      >{char}</span>
    {/each}
  </div>

  <div class="timer-buttons">
    <button
      type="button"
      class="timer-button"
      onclick={handleStartPauseResume}
    >
      {$timerState === 'stopped' ? 'START' : $timerState === 'running' ? 'PAUSE' : 'RESUME'}
    </button>
    <button
      type="button"
      class="timer-button timer-button-reset"
      onclick={() => timer.reset()}
    >
      RESET
    </button>
  </div>

  <div class="duration-controls">
    <div class="duration-label">POMODORO LENGTH</div>
    <div class="duration-row">
      <button type="button" class="duration-btn" onclick={() => timer.adjustDuration(-1)} aria-label="Decrease">−</button>
      <input
        class="duration-input"
        type="number"
        min="1"
        max="180"
        step="1"
        value={durationInput}
        oninput={(e) => {
          const v = e.currentTarget.value;
          if (v === '') {
            durationInput = 25;
            timer.setDuration(25);
            return;
          }
          const n = parseInt(v, 10);
          if (!isNaN(n)) {
            const clamped = Math.max(1, Math.min(180, n));
            durationInput = clamped;
            timer.setDuration(clamped);
          }
        }}
        onchange={setFromInput}
        onblur={setFromInput}
        aria-label="Pomodoro length in minutes"
      />
      <span class="duration-suffix">MINUTES</span>
      <button type="button" class="duration-btn" onclick={() => timer.adjustDuration(1)} aria-label="Increase">+</button>
    </div>
  </div>
</div>

<style>
  .pomodoro-view-old {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-top: auto;
    margin-bottom: auto;
    padding: 3rem 2rem 4rem;
    flex: 1;
    min-height: 0;
  }

  .timer-display-wrap {
    font-family: var(--font-display);
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    font-weight: 900;
    letter-spacing: 0.12em;
    color: var(--red);
    font-size: clamp(5rem, 28vw, 18rem);
  }

  .timer-char {
    display: inline-block;
  }
  .timer-char.colon {
    font-size: 0.4em;
    vertical-align: 0.35em;
    opacity: 0.7;
  }

  .timer-button {
    margin-top: 0;
    background: none;
    border: none;
    color: var(--red);
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 1.4rem;
    font-family: var(--font-body);
    font-weight: 700;
    cursor: pointer;
    transition: color 0.25s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .timer-button:hover {
    color: var(--red-hover);
    transform: scale(1.06);
    outline: none;
  }
  .timer-button:active {
    transform: scale(1.02);
  }

  .timer-buttons {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-top: 2.5rem;
  }

  .timer-button-reset {
    margin-top: 0;
    font-size: 1rem;
    letter-spacing: 0.2em;
    opacity: 0.85;
  }
  .timer-button-reset:hover {
    opacity: 1;
  }

  .duration-controls {
    margin-top: 2.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .duration-label {
    font-family: var(--font-body);
    font-size: 0.9rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--dark-soft);
  }

  .duration-row {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    font-family: var(--font-body);
    font-size: 1.1rem;
  }

  .duration-btn {
    background: none;
    border: none;
    color: var(--red);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    transition: color 0.25s ease, transform 0.25s ease;
  }
  .duration-btn:hover {
    color: var(--red-hover);
    transform: scale(1.08);
    outline: none;
  }

  .duration-input {
    width: 3.5rem;
    text-align: center;
    background: transparent;
    border: none;
    border-bottom: 2px solid var(--red);
    color: var(--red);
    font-family: var(--font-display);
    font-size: 1.1rem;
    padding: 0.15rem 0;
    -moz-appearance: textfield;
  }
  .duration-input::-webkit-outer-spin-button,
  .duration-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .duration-suffix {
    font-size: 0.85rem;
    letter-spacing: 0.18em;
    color: var(--dark-soft);
  }

  @media (max-width: 992px) {
    .pomodoro-view-old {
      padding: 2.5rem 1.75rem 3rem;
    }
    .timer-display-wrap {
      font-size: clamp(4.5rem, 26vw, 14rem);
    }
    .timer-buttons {
      margin-top: 2rem;
    }
    .timer-button {
      font-size: 1.25rem;
    }
    .duration-label {
      font-size: 0.85rem;
    }
    .duration-row {
      font-size: 1rem;
    }
  }

  @media (max-width: 768px) {
    .pomodoro-view-old {
      padding: 2rem 1.5rem 2.5rem;
    }
    .timer-display-wrap {
      font-size: clamp(4rem, 24vw, 12rem);
    }
    .timer-buttons {
      margin-top: 1.75rem;
      gap: 1.25rem;
    }
    .timer-button {
      font-size: 1.1rem;
      letter-spacing: 0.2em;
    }
    .timer-button-reset {
      font-size: 0.95rem;
    }
    .duration-controls {
      margin-top: 1.75rem;
    }
    .duration-input {
      font-size: 1rem;
      width: 3rem;
    }
    .duration-btn {
      font-size: 1.35rem;
    }
  }

  @media (max-width: 480px) {
    .pomodoro-view-old {
      padding: 1.5rem 1rem 2rem;
    }
    .timer-display-wrap {
      font-size: clamp(3.5rem, 22vw, 10rem);
    }
    .timer-buttons {
      flex-direction: column;
      margin-top: 1.5rem;
      gap: 1rem;
    }
    .timer-button {
      font-size: 1rem;
      letter-spacing: 0.15em;
      width: 100%;
    }
    .timer-button-reset {
      font-size: 0.9rem;
    }
    .duration-label {
      font-size: 0.75rem;
    }
    .duration-row {
      gap: 0.75rem;
      font-size: 0.95rem;
    }
    .duration-input {
      width: 2.75rem;
      font-size: 0.95rem;
    }
    .duration-suffix {
      font-size: 0.75rem;
    }
  }
</style>
