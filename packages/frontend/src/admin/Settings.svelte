<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
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
  {/if}

  {#if pickerOpen}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Bildauswahl">
      <div class="modal-body">
        <ImagePicker
          mode="multiple"
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
