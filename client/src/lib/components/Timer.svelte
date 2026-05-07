<script>
  import { ArrowCounterClockwise, Minus, Pause, Play, Plus } from 'phosphor-svelte';
  import { timer } from '$stores/timer.js';

  const { display, state: timerState, baseMinutes, remaining, baseDuration } = timer;

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
  const presetOptions = [25, 50, 90];
  const progressPct = $derived.by(() => {
    const total = Number($baseDuration) || 1;
    const left = Number($remaining) || 0;
    return Math.max(0, Math.min(100, Math.round(((total - left) / total) * 100)));
  });
  const sessionLabel = $derived.by(() => {
    if ($timerState === 'running') return 'In focus';
    if ($timerState === 'paused') return 'Paused';
    return 'Ready';
  });

  function arcOffset(i, total) {
    if (total <= 1) return 0;
    const t = i / (total - 1);
    const parabola = 4 * t * (1 - t);
    return (-0.24 * parabola).toFixed(3);
  }
</script>

<div class="pomodoro-view-old animate-rise rise-2">
  <div class="timer-ribbon" aria-label="Timer status">
    <span class="timer-ribbon-chip">{sessionLabel}</span>
    <span class="timer-ribbon-chip">{$baseMinutes} min</span>
    <span class="timer-ribbon-chip">{Math.max(0, Math.ceil((Number($remaining) || 0) / 60))} left</span>
  </div>

  <div class="timer-presets" aria-label="Timer presets">
    {#each presetOptions as preset}
      <button
        type="button"
        class:active={preset === $baseMinutes}
        class="timer-preset"
        onclick={() => timer.setDuration(preset)}
      >
        {preset}m
      </button>
    {/each}
  </div>

  <div class="timer-status animate-rise rise-1">
    <div class="timer-status-copy">
      <span class="timer-status-label">{sessionLabel}</span>
      <span class="timer-status-detail">{progressPct}% elapsed</span>
    </div>
    <div class="timer-status-track" aria-hidden="true">
      <span class="timer-status-fill" style={`width: ${progressPct}%`}></span>
    </div>
  </div>

  <div class="timer-display-wrap" aria-label={`Timer ${$display || '00:00:00'}`}>
    {#each displayChars as char, i}
      <span
        class="timer-char"
        class:colon={char === ':'}
        class:running={$timerState === 'running'}
        style="transform: translateY({arcOffset(i, displayChars.length)}em)"
      >{char}</span>
    {/each}
  </div>

  <div class="timer-buttons">
    <button
      type="button"
      class="timer-button timer-button-primary"
      onclick={handleStartPauseResume}
    >
      {#if $timerState === 'running'}
        <Pause size={18} weight="fill" />
        <span>Pause</span>
      {:else}
        <Play size={18} weight="fill" />
        <span>{$timerState === 'stopped' ? 'Start' : 'Resume'}</span>
      {/if}
    </button>
    <button
      type="button"
      class="timer-button timer-button-reset"
      onclick={() => timer.reset()}
    >
      <ArrowCounterClockwise size={16} weight="bold" />
      <span>Reset</span>
    </button>
  </div>

  <div class="duration-controls">
    <div class="duration-label">Length</div>
    <div class="duration-row">
      <button type="button" class="duration-btn" onclick={() => timer.adjustDuration(-1)} aria-label="Decrease">
        <Minus size={16} weight="bold" />
      </button>
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
      <span class="duration-suffix">min</span>
      <button type="button" class="duration-btn" onclick={() => timer.adjustDuration(1)} aria-label="Increase">
        <Plus size={16} weight="bold" />
      </button>
    </div>
  </div>
</div>

<style>
  .pomodoro-view-old {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    margin-block: auto;
    padding: 2.4rem 1.5rem 3rem;
    flex: 1;
    min-height: 0;
  }

  .timer-ribbon,
  .timer-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: center;
  }

  .timer-ribbon-chip,
  .timer-preset,
  .duration-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.5rem;
    padding: 0.55rem 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(11, 110, 58, 0.12);
    background: rgba(255, 255, 255, 0.82);
    color: var(--dark-soft);
    font-family: var(--font-ui);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .timer-ribbon-chip {
    cursor: default;
  }

  .timer-preset,
  .duration-btn {
    transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .timer-preset:hover,
  .timer-preset.active,
  .duration-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(11, 110, 58, 0.22);
    background: rgba(11, 110, 58, 0.08);
    color: var(--red);
  }

  .timer-status {
    width: min(30rem, 100%);
    display: grid;
    gap: 0.55rem;
    margin-top: 0.25rem;
  }

  .timer-status-copy {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
    font-family: var(--font-ui);
  }

  .timer-status-label {
    color: var(--red);
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .timer-status-detail {
    color: var(--dark-muted);
    font-size: 0.8rem;
  }

  .timer-status-track {
    width: 100%;
    height: 6px;
    background: rgba(212, 212, 200, 0.7);
    border-radius: 999px;
    overflow: hidden;
  }

  .timer-status-fill {
    display: block;
    height: 100%;
    background: var(--red);
    border-radius: inherit;
    transition: width 0.6s var(--ease-out);
  }

  .timer-display-wrap {
    font-family: var(--font-display);
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    font-weight: 400;
    letter-spacing: 0;
    color: var(--red);
    font-size: clamp(4.6rem, 26vw, 15rem);
  }

  .timer-char {
    display: inline-block;
    transition: color 0.2s ease, opacity 0.2s ease;
  }

  .timer-char.running {
    animation: timerPulse 1s ease-in-out infinite;
  }

  .timer-char.colon {
    font-size: 0.4em;
    vertical-align: 0.35em;
    opacity: 0.7;
  }

  .timer-buttons {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    margin-top: 1.4rem;
  }

  .timer-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0.72rem 1rem;
    border-radius: 8px;
    border: 2px solid rgba(36, 24, 15, 0.78);
    background: rgba(255, 255, 255, 0.84);
    color: var(--red);
    font-family: var(--font-ui);
    font-size: 0.84rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .timer-button:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 rgba(36, 24, 15, 0.12);
  }

  .timer-button:active {
    transform: translate(0, 0) scale(0.985);
    box-shadow: 2px 2px 0 rgba(36, 24, 15, 0.1);
  }

  .timer-button-primary {
    background: var(--red);
    border-color: var(--red);
    color: var(--bg-soft);
  }

  .timer-button-primary:hover {
    background: var(--red-hover);
    border-color: var(--red-hover);
    color: var(--bg-soft);
  }

  .timer-button-reset:hover {
    background: rgba(11, 110, 58, 0.08);
  }

  .duration-controls {
    margin-top: 0.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
  }

  .duration-label {
    font-family: var(--font-ui);
    font-size: 0.76rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dark-muted);
  }

  .duration-row {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .duration-btn {
    padding: 0;
    width: 2.4rem;
  }

  .duration-input {
    width: 4.25rem;
    min-height: 2.75rem;
    text-align: center;
    background: rgba(255, 255, 255, 0.82);
    border: 2px solid rgba(36, 24, 15, 0.72);
    border-radius: 8px;
    color: var(--red);
    font-family: var(--font-display);
    font-size: 1.1rem;
    font-weight: 400;
    padding: 0.15rem 0;
    -moz-appearance: textfield;
  }

  .duration-input::-webkit-outer-spin-button,
  .duration-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .duration-suffix {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--dark-muted);
  }

  @keyframes timerPulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.78;
    }
  }

  @media (max-width: 768px) {
    .pomodoro-view-old {
      padding: 2rem 1.15rem 2.4rem;
    }

    .timer-status-copy,
    .timer-buttons {
      width: 100%;
    }

    .timer-buttons {
      flex-direction: column;
    }

    .timer-button {
      width: min(22rem, 100%);
    }
  }

  @media (max-width: 480px) {
    .pomodoro-view-old {
      padding: 1.6rem 1rem 2rem;
    }

    .timer-display-wrap {
      font-size: clamp(3.7rem, 22vw, 8.2rem);
    }

    .duration-row {
      gap: 0.55rem;
    }

    .duration-input {
      width: 3.6rem;
    }
  }

  /* Mobile focus pass */
  @media (max-width: 760px) {
    .pomodoro-view-old {
      justify-content: start;
      gap: 0.75rem;
      min-height: 100%;
      padding: 0.85rem 0.75rem 1rem;
    }

    .timer-ribbon,
    .timer-presets {
      width: 100%;
      justify-content: stretch;
      gap: 0.4rem;
    }

    .timer-ribbon-chip,
    .timer-preset {
      flex: 1 1 0;
      min-width: 0;
      min-height: 2.35rem;
      padding: 0.45rem 0.5rem;
      border-radius: 8px;
      font-size: 0.66rem;
    }

    .timer-status {
      width: 100%;
    }

    .timer-display-wrap {
      width: 100%;
      margin-block: 0.35rem;
      font-size: clamp(3.4rem, 22vw, 7.6rem);
      line-height: 0.95;
    }

    .timer-buttons {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
      gap: 0.55rem;
      width: 100%;
      margin-top: 0.25rem;
    }

    .timer-button {
      width: 100%;
      min-height: 3.1rem;
      padding: 0.7rem 0.75rem;
      border-radius: 8px;
    }

    .duration-controls {
      width: 100%;
      margin-top: 0.25rem;
      align-items: stretch;
    }

    .duration-row {
      display: grid;
      grid-template-columns: 2.6rem minmax(0, 1fr) auto 2.6rem;
      gap: 0.5rem;
      width: 100%;
    }

    .duration-btn {
      width: 2.6rem;
      border-radius: 8px;
    }

    .duration-input {
      width: 100%;
      min-height: 2.75rem;
    }
  }

  @media (max-width: 390px), (max-height: 740px) and (max-width: 760px) {
    .pomodoro-view-old {
      gap: 0.55rem;
      padding-top: 0.55rem;
    }

    .timer-display-wrap {
      font-size: clamp(3rem, 20vw, 5.9rem);
      margin-block: 0.1rem;
    }

    .timer-ribbon-chip {
      display: none;
    }

    .timer-preset {
      min-height: 2.15rem;
    }
  }
</style>
