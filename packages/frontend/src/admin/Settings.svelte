<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError } from '../lib/api.js';
  import { settings as branding } from '../lib/settings.svelte.js';
  import { imageUrl } from '../lib/images.js';
  import AdminLayout from './AdminLayout.svelte';
  import ImagePicker from './editor/ImagePicker.svelte';

  let siteTitle = $state('');
  let accentColor = $state('#3477eb');
  let backgroundImageIds = $state<string[]>([]);
  let loading = $state(true);
  let saved = $state(false);
  let error = $state('');
  let pickerOpen = $state(false);

  onMount(async () => {
    try {
      const current = await api.getSettings();
      siteTitle = current.siteTitle;
      accentColor = current.accentColor;
      backgroundImageIds = current.backgroundImageIds ?? [];
    } finally {
      loading = false;
    }
  });

  function removeBackground(id: string): void {
    backgroundImageIds = backgroundImageIds.filter((x) => x !== id);
  }
  function onPickerSelect(ids: string[]): void {
    // Append, skipping duplicates so the same image isn't pinned twice.
    backgroundImageIds = [
      ...backgroundImageIds,
      ...ids.filter((id) => !backgroundImageIds.includes(id)),
    ];
    pickerOpen = false;
  }

  async function save(event: Event): Promise<void> {
    event.preventDefault();
    error = '';
    saved = false;
    try {
      await branding.save({ siteTitle, accentColor, backgroundImageIds });
      saved = true;
    } catch {
      error = 'Speichern fehlgeschlagen.';
    }
  }

  let oldPassword = $state('');
  let newPassword = $state('');
  let newPasswordConfirm = $state('');
  let pwError = $state('');
  let pwSaved = $state(false);
  let pwBusy = $state(false);

  async function changePassword(event: Event): Promise<void> {
    event.preventDefault();
    pwError = '';
    pwSaved = false;
    // Mirror the server's rules client-side for an immediate, precise hint.
    if (newPassword.length < 8) {
      pwError = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.';
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      pwError = 'Die neuen Passwörter stimmen nicht überein.';
      return;
    }
    if (newPassword === oldPassword) {
      pwError = 'Das neue Passwort muss sich vom alten unterscheiden.';
      return;
    }
    pwBusy = true;
    try {
      await api.changePassword(oldPassword, newPassword, newPasswordConfirm);
      pwSaved = true;
      oldPassword = '';
      newPassword = '';
      newPasswordConfirm = '';
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        (err.body as { error?: string } | undefined)?.error === 'invalid_current_password'
      ) {
        pwError = 'Das aktuelle Passwort ist falsch.';
      } else {
        pwError = 'Passwortänderung fehlgeschlagen.';
      }
    } finally {
      pwBusy = false;
    }
  }
</script>

<AdminLayout>
  <h1>Einstellungen</h1>

  {#if loading}
    <p>Lädt…</p>
  {:else}
    <form class="settings" onsubmit={save}>
      {#if error}
        <p role="alert" class="err">{error}</p>
      {/if}
      {#if saved}
        <p class="ok" role="status">Gespeichert.</p>
      {/if}
      <label>
        Seitentitel
        <input type="text" aria-label="Seitentitel" bind:value={siteTitle} />
      </label>
      <label>
        Akzentfarbe
        <input type="color" aria-label="Akzentfarbe" bind:value={accentColor} />
      </label>

      <div class="bg-field">
        <span class="bg-label">Hintergrundbilder</span>
        {#if backgroundImageIds.length > 0}
          <ul class="bg-grid">
            {#each backgroundImageIds as id (id)}
              <li>
                <img class="bg-thumb" src={imageUrl(id, 'thumb')} alt="" />
                <button
                  type="button"
                  aria-label="Hintergrundbild entfernen"
                  onclick={() => removeBackground(id)}>Entfernen</button
                >
              </li>
            {/each}
          </ul>
        {:else}
          <p class="bg-empty">Keine Hintergrundbilder gewählt.</p>
        {/if}
        <button type="button" onclick={() => (pickerOpen = true)}>
          Hintergrundbilder hinzufügen
        </button>
      </div>

      <button type="submit">Speichern</button>
    </form>

    <section class="password">
      <h2>Passwort ändern</h2>
      <form class="settings" onsubmit={changePassword}>
        {#if pwError}
          <p role="alert" class="err">{pwError}</p>
        {/if}
        {#if pwSaved}
          <p class="ok" role="status">Passwort geändert.</p>
        {/if}
        <label>
          Aktuelles Passwort
          <input type="password" aria-label="Aktuelles Passwort" bind:value={oldPassword} autocomplete="current-password" />
        </label>
        <label>
          Neues Passwort
          <input type="password" aria-label="Neues Passwort" bind:value={newPassword} autocomplete="new-password" />
        </label>
        <label>
          Neues Passwort bestätigen
          <input type="password" aria-label="Neues Passwort bestätigen" bind:value={newPasswordConfirm} autocomplete="new-password" />
        </label>
        <button type="submit" disabled={pwBusy}>Passwort ändern</button>
      </form>
    </section>
  {/if}

  {#if pickerOpen}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Bildauswahl">
      <div class="modal-body">
        <ImagePicker
          mode="multiple"
          initialOrphansOnly={true}
          onSelect={onPickerSelect}
          onCancel={() => (pickerOpen = false)}
        />
      </div>
    </div>
  {/if}
</AdminLayout>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 360px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .err {
    color: #c53030;
  }
  .ok {
    color: #2f855a;
  }
  .password {
    margin-top: 2rem;
    border-top: 1px solid #e2e8f0;
    padding-top: 1rem;
  }
  .password h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }
  .bg-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .bg-label {
    font-weight: 600;
  }
  .bg-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .bg-grid li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .bg-thumb {
    width: 96px;
    height: 64px;
    object-fit: cover;
    border-radius: 6px;
  }
  .bg-empty {
    margin: 0;
    color: #718096;
    font-size: 0.85rem;
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }
  .modal-body {
    background: #fff;
    border-radius: 8px;
    padding: 1rem;
    width: min(720px, 92vw);
    max-height: 88vh;
    overflow: auto;
  }
</style>
