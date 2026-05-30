<script lang="ts">
  import type { ImageDto } from '@stb/shared';
  import { api } from '../../lib/api.js';
  import type { EventSourceFactory } from '../../lib/uploads.js';
  import UploadProgress from './UploadProgress.svelte';

  interface Props {
    mode?: 'single' | 'multiple';
    onSelect: (ids: string[]) => void;
    onCancel: () => void;
    /** Forwarded to UploadProgress for tests. */
    eventSourceFactory?: EventSourceFactory;
  }

  let { mode = 'single', onSelect, onCancel, eventSourceFactory }: Props = $props();

  let images = $state<ImageDto[]>([]);
  let total = $state(0);
  let page = $state(1);
  const pageSize = 24;
  let q = $state('');
  let sort = $state<'newest' | 'oldest' | 'filename'>('newest');
  let orphansOnly = $state(false);
  let selected = $state<string[]>([]);
  let uploadId = $state<string | null>(null);
  let uploadError = $state('');

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  async function load(): Promise<void> {
    const res = await api.listImages({ page, pageSize, q, orphansOnly, sort });
    images = res.items;
    total = res.total;
  }

  // Reload whenever the query, sort, orphan filter or page changes.
  $effect(() => {
    void q;
    void sort;
    void orphansOnly;
    void page;
    void load();
  });

  function isSelected(id: string): boolean {
    return selected.includes(id);
  }

  function toggle(id: string): void {
    if (mode === 'single') {
      selected = isSelected(id) ? [] : [id];
      return;
    }
    selected = isSelected(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function confirm(): void {
    if (selected.length > 0) onSelect(selected);
  }

  function resetToFirstPage(): void {
    page = 1;
  }

  async function onFileChange(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadError = '';
    try {
      const accepted = await api.uploadImage(file);
      uploadId = accepted.uploadId;
    } catch (err) {
      uploadError = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
    } finally {
      input.value = '';
    }
  }

  function onUploadDone(image: ImageDto): void {
    uploadId = null;
    // Surface the freshly uploaded image and pre-select it.
    selected = mode === 'single' ? [image.id] : [...selected, image.id];
    page = 1;
    void load();
  }
</script>

<div class="image-picker">
  <header>
    <h2>{mode === 'single' ? 'Bild auswählen' : 'Bilder auswählen'}</h2>
    <button type="button" aria-label="Schließen" onclick={onCancel}>✕</button>
  </header>

  <div class="filters">
    <input
      type="search"
      placeholder="Dateiname filtern"
      aria-label="Dateiname filtern"
      bind:value={q}
      oninput={resetToFirstPage}
    />
    <select aria-label="Sortierung" bind:value={sort} onchange={resetToFirstPage}>
      <option value="newest">Neueste</option>
      <option value="oldest">Älteste</option>
      <option value="filename">Dateiname</option>
    </select>
    <label>
      <input type="checkbox" bind:checked={orphansOnly} onchange={resetToFirstPage} />
      Nur unbenutzte
    </label>
  </div>

  <div class="upload">
    <label>
      Hochladen
      <input type="file" accept="image/*" onchange={onFileChange} />
    </label>
    {#if uploadId}
      <UploadProgress
        {uploadId}
        onDone={onUploadDone}
        onError={(m) => (uploadError = m)}
        {eventSourceFactory}
      />
    {/if}
    {#if uploadError}
      <span class="err" role="alert">{uploadError}</span>
    {/if}
  </div>

  {#if images.length === 0}
    <p class="empty">Keine Bilder gefunden.</p>
  {:else}
    <ul class="grid">
      {#each images as image (image.id)}
        <li>
          <button
            type="button"
            class="thumb"
            class:selected={isSelected(image.id)}
            aria-pressed={isSelected(image.id)}
            aria-label={image.originalFilename}
            onclick={() => toggle(image.id)}
          >
            <img src={image.thumbUrl} alt="" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <footer>
    <div class="pager">
      <button type="button" disabled={page <= 1} onclick={() => (page -= 1)}>Zurück</button>
      <span>Seite {page} von {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onclick={() => (page += 1)}
        >Weiter</button
      >
    </div>
    <div class="actions">
      <span class="count" aria-live="polite">{selected.length} ausgewählt</span>
      <button type="button" onclick={onCancel}>Abbrechen</button>
      <button type="button" disabled={selected.length === 0} onclick={confirm}>Auswählen</button>
    </div>
  </footer>
</div>

<style>
  .image-picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .filters,
  .upload {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
  }
  .thumb {
    padding: 0;
    border: 2px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    background: none;
  }
  .thumb.selected {
    border-color: var(--accent);
  }
  .thumb img {
    width: 100%;
    height: 100px;
    object-fit: cover;
    display: block;
  }
  .count {
    font-size: 0.85rem;
    color: #718096;
  }
  .err {
    color: #c53030;
  }
  .empty {
    color: #a0aec0;
    font-style: italic;
  }
</style>
