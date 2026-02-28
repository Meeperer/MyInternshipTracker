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

<div class="auth-page">
  <div class="auth-container">
    <h1>Internship Tracker</h1>
    <p class="auth-subtitle">Create your account</p>

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
            tabindex="-1"
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
            tabindex="-1"
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
</div>

<style>
  .auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .auth-container {
    width: 100%;
    max-width: 380px;
    text-align: center;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.3rem;
  }

  .auth-subtitle {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--dark-soft);
    margin-bottom: 2rem;
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
    font-weight: 600;
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
</style>
