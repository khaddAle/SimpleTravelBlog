<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { auth } from '../lib/auth.svelte.js';
  import { settings } from '../lib/settings.svelte.js';
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

<div class="login-top">
  <a class="brand" href="#/">
    <span class="brand-name">{settings.siteTitle}</span>
    <span class="brand-tag">Redaktion</span>
  </a>
</div>

<main class="login-main">
  <div>
    <form class="login-card" onsubmit={submit} autocomplete="off">
      <h1>Anmelden</h1>
      <p class="sub">Privater Bereich — nur für Redakteur:innen.</p>

      {#if error}
        <p class="err" role="alert">{error}</p>
      {/if}

      <div class="fld">
        <label for="login-user">Benutzername</label>
        <input
          id="login-user"
          type="text"
          bind:value={username}
          autocomplete="username"
          placeholder="z. B. anna"
        />
      </div>
      <div class="fld">
        <label for="login-pass">Passwort</label>
        <input
          id="login-pass"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <button class="btn primary" type="submit" disabled={busy}>Anmelden</button>
    </form>

    <p class="note">
      Geschützt durch Anmeldelimit nach mehreren Fehlversuchen.<br />
      Diese Seite ist nicht öffentlich auffindbar.
    </p>
    <div class="back-wrap">
      <a class="back" href="#/"><span aria-hidden="true">←</span> Zur Website</a>
    </div>
  </div>
</main>

<style>
  .login-top {
    display: flex;
    justify-content: center;
    padding: 40px 24px 0;
  }
  .login-main {
    min-height: calc(100vh - 90px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px 24px 60px;
  }
  .login-card {
    width: 100%;
    max-width: 384px;
    background: #fff;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame);
    padding: 34px 32px 30px;
  }
  .login-card h1 {
    font-size: 23px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin: 0;
  }
  .login-card .sub {
    font-size: 13.5px;
    color: var(--muted);
    margin: 6px 0 24px;
  }
  .fld {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-bottom: 16px;
  }
  .fld label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .fld input {
    font: inherit;
    font-size: 15px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 12px 13px;
    border-radius: 7px;
  }
  .fld input:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
  }
  .login-card .btn.primary {
    width: 100%;
    justify-content: center;
    padding: 13px;
    font-size: 14.5px;
    margin-top: 6px;
  }
  .err {
    font-size: 13px;
    color: #b4452f;
    background: #f7e4df;
    border: 1px solid #eccabf;
    padding: 9px 12px;
    border-radius: 6px;
    margin-bottom: 16px;
  }
  .note {
    font-size: 12px;
    color: var(--faint);
    text-align: center;
    margin-top: 18px;
    line-height: 1.5;
  }
  .back-wrap {
    text-align: center;
  }
  .back {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    font-size: 13px;
    color: var(--muted);
    text-decoration: none;
    margin-top: 22px;
  }
  .back:hover {
    color: var(--ink);
  }
</style>
