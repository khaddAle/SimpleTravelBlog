<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { auth } from '../lib/auth.svelte.js';
  import { ApiError } from '../lib/api.js';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      await auth.login(username, password);
      push('/admin');
    } catch (err) {
      error =
        err instanceof ApiError && err.status === 429
          ? 'Zu viele Anmeldeversuche. Bitte später erneut.'
          : 'Anmeldung fehlgeschlagen.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="login" onsubmit={submit}>
  <h1>Anmelden</h1>
  {#if error}
    <p role="alert" class="err">{error}</p>
  {/if}
  <label>
    Benutzername
    <input type="text" aria-label="Benutzername" bind:value={username} autocomplete="username" />
  </label>
  <label>
    Passwort
    <input
      type="password"
      aria-label="Passwort"
      bind:value={password}
      autocomplete="current-password"
    />
  </label>
  <button type="submit" disabled={busy}>Anmelden</button>
</form>

<style>
  .login {
    max-width: 320px;
    margin: 4rem auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .err {
    color: #c53030;
  }
</style>
