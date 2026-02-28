<script>
  import { auth, isAuthenticated } from '$stores/auth.js';
  import { goto } from '$app/navigation';
  import { toast } from '$stores/toast.js';

  let email = $state('');
  let password = $state('');
  let submitting = $state(false);
  let showPassword = $state(false);
  let errors = $state({ email: '', password: '' });

  $effect(() => {
    if ($isAuthenticated) goto('/dashboard');
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    errors = { email: '', password: '' };
    let valid = true;
    const e = email.trim();
    const p = password.trim();
    if (!e) {
      errors.email = 'Email is required';
      valid = false;
    } else if (!EMAIL_RE.test(e)) {
      errors.email = 'Enter a valid email address';
      valid = false;
    }
    if (!p) {
      errors.password = 'Password is required';
      valid = false;
    }
    return valid;
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!validate()) return;

    submitting = true;
    try {
      await auth.login(email.trim(), password);
      goto('/dashboard');
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
    <p class="auth-subtitle">Sign in to your account</p>

    <form onsubmit={handleLogin} novalidate>
      <div class="field">
        <label class="label" for="email">Email</label>
        <input
          id="email"
          class="input"
          class:invalid={errors.email}
          type="email"
          bind:value={email}
          required
          autocomplete="email"
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
            autocomplete="current-password"
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
        {/if}
      </div>
      <button class="btn btn-primary full-width" type="submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign In'}
      </button>
    </form>

    <p class="auth-link">
      <a href="https://supabase.com/docs/guides/auth/password-reset" target="_blank" rel="noopener noreferrer">Forgot password?</a>
    </p>
    <p class="auth-link">
      Don't have an account? <a href="/register">Register</a>
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
