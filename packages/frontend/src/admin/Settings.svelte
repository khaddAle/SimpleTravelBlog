<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { settings as branding } from '../lib/settings.svelte.js';
  import AdminLayout from './AdminLayout.svelte';

  let siteTitle = $state('');
  let accentColor = $state('#3477eb');
  let loading = $state(true);
  let saved = $state(false);
  let error = $state('');

  onMount(async () => {
    try {
      const current = await api.getSettings();
      siteTitle = current.siteTitle;
      accentColor = current.accentColor;
    } finally {
      loading = false;
    }
  });

  async function save(event: Event): Promise<void> {
    event.preventDefault();
    error = '';
    saved = false;
    try {
      await branding.save({ siteTitle, accentColor });
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
      <button type="submit">Speichern</button>
    </form>
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
</style>
