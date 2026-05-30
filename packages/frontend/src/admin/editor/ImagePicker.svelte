<script lang="ts">
  import { untrack } from 'svelte';
  import type { ImageDto } from '@stb/shared';
  import { api } from '../../lib/api.js';
  import type { EventSourceFactory } from '../../lib/uploads.js';
  import UploadProgress from './UploadProgress.svelte';

  interface Props {
    mode?: 'single' | 'multiple';
    onSelect: (ids: string[]) => void;
    onCancel: () => void;
    /** Start with the "Nur unbenutzte" filter on (fresh inserts); off when editing. */
    initialOrphansOnly?: boolean;
    /** Pre-select these ids (e.g. the gallery's current images when editing). */
    initialSelected?: string[];
    /**
     * Image ids already used in the current (possibly unsaved) post. While
     * "Nur unbenutzte" is on, these are hidden too — the server orphan filter
     * only knows persisted references, so without this freshly-placed images
     * would still appear as unused.
     */
    excludeIds?: string[];
    /** Forwarded to UploadProgress for tests. */
    eventSourceFactory?: EventSourceFactory;
  }

  let {
    mode = 'single',
    onSelect,
    onCancel,
    initialOrphansOnly = false,
    initialSelected = [],
    excludeIds = [],
    eventSourceFactory,
  }: Props = $props();

  let images = $state<ImageDto[]>([]);
  let total = $state(0);
  let page = $state(1);
  const pageSize = 24;
  let q = $state('');
  let sort = $state<'newest' | 'oldest' | 'filename'>('newest');
  // Props are init-only seeds for this local state; untrack documents that.
  let orphansOnly = $state(untrack(() => initialOrphansOnly));
  let selected = $state<string[]>(untrack(() => [...initialSelected]));

  /** One in-flight or finished upload. `uploadId` is null until the POST returns. */
  interface UploadJob {
    key: string;
    filename: string;
    uploadId: string | null;
    error: string | null;
  }
  let jobs = $state<UploadJob[]>([]);

  // Accepted upload types — the real pipeline (sharp + libheif) handles these.
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
  // Cap simultaneous uploads so a large multi-select doesn't saturate the link.
  const MAX_CONCURRENT_UPLOADS = 3;

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  // When showing only unused images, also drop ids already placed elsewhere in
  // this post — but never hide one that's currently selected, so an edited
  // gallery's own images stay visible.
  const visibleImages = $derived(
    orphansOnly && excludeIds.length > 0
      ? images.filter((img) => !excludeIds.includes(img.id) || selected.includes(img.id))
      : images,
  );

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

  function patchJob(key: string, patch: Partial<UploadJob>): void {
    jobs = jobs.map((job) => (job.key === key ? { ...job, ...patch } : job));
  }

  async function onFileChange(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    // Fan out one upload per file, but never more than MAX_CONCURRENT_UPLOADS
    // POSTs in flight: a small pool of workers drains a shared queue.
    const queue = [...files];
    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, queue.length);
    const workers = Array.from({ length: workerCount }, () => uploadWorker(queue));
    await Promise.all(workers);
  }

  async function uploadWorker(queue: File[]): Promise<void> {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const key = crypto.randomUUID();
      jobs = [...jobs, { key, filename: file.name, uploadId: null, error: null }];
      try {
        const accepted = await api.uploadImage(file);
        patchJob(key, { uploadId: accepted.uploadId });
      } catch (err) {
        patchJob(key, {
          error: err instanceof Error ? err.message : 'Upload fehlgeschlagen',
        });
      }
    }
  }

  function onUploadDone(image: ImageDto): void {
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
      <input type="file" accept={ACCEPT} multiple onchange={onFileChange} />
    </label>
  </div>
  {#if jobs.length > 0}
    <ul class="uploads">
      {#each jobs as job (job.key)}
        <li>
          {#if job.error}
            <span class="err" role="alert">{job.filename}: {job.error}</span>
          {:else if job.uploadId}
            <UploadProgress
              uploadId={job.uploadId}
              onDone={onUploadDone}
              onError={(m) => patchJob(job.key, { error: m })}
              {eventSourceFactory}
            />
          {:else}
            <span class="pending">{job.filename} – wird vorbereitet…</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if visibleImages.length === 0}
    <p class="empty">Keine Bilder gefunden.</p>
  {:else}
    <ul class="grid">
      {#each visibleImages as image (image.id)}
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
  .uploads {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .pending {
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
