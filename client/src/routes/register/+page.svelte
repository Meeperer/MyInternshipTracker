<script>
  import { auth, isAuthenticated } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { toast } from '$stores/toast.js';

  let fullName = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let submitting = $state(false);
  let showPassword = $state(false);
  let showConfirm = $state(false);
  let errors = $state({ fullName: '', email: '', password: '', confirm: '' });

  $effect(() => {
    if ($isAuthenticated) goto('/dashboard');
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    errors = { fullName: '', email: '', password: '', confirm: '' };
    let valid = true;
    const name = fullName.trim();
    const e = email.trim();
    if (!name) {
      errors.fullName = 'Full name is required';
      valid = false;
    } else if (name.length < 2) {
      errors.fullName = 'Name must be at least 2 characters';
      valid = false;
    }
    if (!e) {
      errors.email = 'Email is required';
      valid = false;
    } else if (!EMAIL_RE.test(e)) {
      errors.email = 'Enter a valid email address';
      valid = false;
    }
    if (!password) {
      errors.password = 'Password is required';
      valid = false;
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
      valid = false;
    }
    if (!confirmPassword) {
      errors.confirm = 'Please confirm your password';
      valid = false;
    } else if (password !== confirmPassword) {
      errors.confirm = 'Passwords do not match';
      valid = false;
    }
    return valid;
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!validate()) return;

    submitting = true;
    try {
      await auth.register(email.trim(), password, fullName.trim());
      toast.success('Account created! You can now sign in.');
      goto('/login');
    } catch (err) {
      toast.error(err.message);
    } finally {
      submitting = false;
    }
  }
</script>

<main id="main-content" class="auth-page page-enter">
  <div class="auth-container animate-rise rise-2">
    <p class="auth-kicker">by lord</p>
    <h1>JOURNAL</h1>
    <p class="auth-subtitle">Create account</p>

    <form onsubmit={handleRegister} novalidate>
      <div class="field">
        <label class="label" for="name">Full Name</label>
        <input
          id="name"
          class="input"
          class:invalid={errors.fullName}
          type="text"
          bind:value={fullName}
          required
          autocomplete="name"
          placeholder="Your full name"
        />
        {#if errors.fullName}
          <p class="field-error" role="alert">{errors.fullName}</p>
        {/if}
      </div>
      <div class="field">
        <label class="label" for="email">Email</label>
        <input
          id="email"
          class="input"
          class:invalid={errors.email}
          type="email"
          bind:value={email}
          required
          placeholder="you@example.com"
        />
        {#if errors.email}
          <p class="field-error" role="alert">{errors.email}</p>
        {/if}
      </div>
      <div class="field">
        <label class="label" for="password">Password</label>
        <div class="password-wrap">
          <input
            id="password"
            class="input"
            class:invalid={errors.password}
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            required
            minlength="6"
            autocomplete="new-password"
            placeholder="At least 6 characters"
          />
          <button
            type="button"
            class="password-toggle"
            onclick={() => (showPassword = !showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {#if errors.password}
          <p class="field-error" role="alert">{errors.password}</p>
        {:else}
          <p class="field-hint">Minimum 6 characters</p>
        {/if}
      </div>
      <div class="field">
        <label class="label" for="confirm">Confirm Password</label>
        <div class="password-wrap">
          <input
            id="confirm"
            class="input"
            class:invalid={errors.confirm}
            type={showConfirm ? 'text' : 'password'}
            bind:value={confirmPassword}
            required
            autocomplete="new-password"
            placeholder="Re-enter password"
          />
          <button
            type="button"
            class="password-toggle"
            onclick={() => (showConfirm = !showConfirm)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            aria-pressed={showConfirm}
          >
            {showConfirm ? 'Hide' : 'Show'}
          </button>
        </div>
        {#if errors.confirm}
          <p class="field-error" role="alert">{errors.confirm}</p>
        {/if}
      </div>
      <button class="btn btn-primary full-width" type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create Account'}
      </button>
    </form>

    <p class="auth-link">
      Already have an account? <a href="/login">Sign In</a>
    </p>
  </div>
</main>

<style>
  .auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    background:
      linear-gradient(rgba(36, 24, 15, 0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(36, 24, 15, 0.04) 1px, transparent 1px),
      var(--bg);
    background-size: 32px 32px, 32px 32px, auto;
  }

  .auth-container {
    position: relative;
    overflow: hidden;
    width: 100%;
    max-width: 430px;
    text-align: center;
    padding: 2.1rem;
    border: 2px solid rgba(36, 24, 15, 0.88);
    border-radius: 8px;
    background: var(--paper-strong);
    box-shadow: 6px 6px 0 rgba(36, 24, 15, 0.14);
  }

  .auth-container::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: 0.55rem;
    background: var(--leaf);
  }

  .auth-kicker {
    margin: 0 0 0.25rem;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--moss);
  }

  h1 {
    font-size: clamp(2.6rem, 5vw, 4rem);
    line-height: 0.88;
    margin-bottom: 0.3rem;
  }

  .auth-subtitle {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--dark-soft);
    margin-bottom: 1.6rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    text-align: left;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .password-wrap {
    position: relative;
    width: 100%;
  }

  .password-wrap .input {
    padding-right: 4rem;
  }

  .password-toggle {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.35rem 0.6rem;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--dark-soft);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  .password-toggle:hover {
    color: var(--red);
  }

  .full-width {
    width: 100%;
    justify-content: center;
    margin-top: 0.5rem;
  }

  .auth-link {
    margin-top: 1.5rem;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--dark-soft);
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .auth-container {
      transition: transform 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out);
    }

    .auth-container:hover {
      transform: translate(-1px, -1px);
      box-shadow: 7px 7px 0 rgba(36, 24, 15, 0.16);
    }
  }

  @media (max-width: 520px) {
    .auth-page {
      align-items: stretch;
      padding: 1rem;
    }

    .auth-container {
      align-self: center;
      padding: 1.6rem;
    }
  }
</style>
