<script lang="ts">
  import { untrack } from 'svelte';
  import type { ImageDto } from '@stb/shared';
  import { api } from '../../lib/api.js';
  import type { EventSourceFactory } from '../../lib/uploads.js';
  import {
    rememberedSort,
    rememberSort,
    type ImageSortKey,
  } from '../imageSortMemory.js';
  import UploadProgress from './UploadProgress.svelte';
  import Lightbox from '../../blocks/Lightbox.svelte';

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
    /**
     * When the orphan filter is on, the server discounts this post's own
     * persisted image references — so images dropped from the post being edited
     * become selectable again without exposing ones still used elsewhere.
     */
    excludePostId?: string | undefined;
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
    excludePostId,
    eventSourceFactory,
  }: Props = $props();

  let images = $state<ImageDto[]>([]);
  let total = $state(0);
  let page = $state(1);
  const pageSize = 24;
  let q = $state('');
  // Default to capture-date oldest-first; restore the user's last choice for the
  // rest of the session (see imageSortMemory — resets on a full reload).
  let sort = $state<ImageSortKey>(rememberedSort('picker', 'taken-oldest'));
  $effect(() => {
    rememberSort('picker', sort);
  });
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

  // The image whose full-size preview is open, or null. Set only on a magnifier
  // click → the Lightbox (and its ≤1600px display fetch) mounts lazily.
  let preview = $state<ImageDto | null>(null);

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
    const res = await api.listImages({
      page,
      pageSize,
      q,
      orphansOnly,
      sort,
      ...(excludePostId ? { excludePostId } : {}),
    });
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
    <h3>{mode === 'single' ? 'Bild auswählen' : 'Bilder auswählen'}</h3>
    <button type="button" class="close" aria-label="Schließen" onclick={onCancel}>✕</button>
  </header>

  <div class="toolbar">
    <input
      type="search"
      class="search"
      placeholder="Dateiname filtern"
      aria-label="Dateiname filtern"
      bind:value={q}
      oninput={resetToFirstPage}
    />
    <select class="select" aria-label="Sortierung" bind:value={sort} onchange={resetToFirstPage}>
      <option value="newest">Neueste</option>
      <option value="oldest">Älteste</option>
      <option value="filename">Dateiname</option>
      <option value="taken-newest">Aufnahme neueste</option>
      <option value="taken-oldest">Aufnahme älteste</option>
    </select>
    <label class="checkbox">
      <input type="checkbox" bind:checked={orphansOnly} onchange={resetToFirstPage} />
      Nur unbenutzte
    </label>
    <span class="spacer"></span>
    <label class="tb-btn upload-btn">
      Hochladen
      <input type="file" class="sr-only" accept={ACCEPT} multiple onchange={onFileChange} />
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
            <span class="mat"><span class="frame"><img src={image.thumbUrl} alt="" /></span></span>
          </button>
          <button
            type="button"
            class="zoom"
            aria-label={`${image.originalFilename} in voller Größe anzeigen`}
            onclick={() => (preview = image)}
          >
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="5" /><path d="M12 12l4 4" />
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <footer>
    <div class="pager">
      <button type="button" class="tb-btn" disabled={page <= 1} onclick={() => (page -= 1)}>
        Zurück
      </button>
      <span class="page-label">Seite {page} von {totalPages}</span>
      <button type="button" class="tb-btn" disabled={page >= totalPages} onclick={() => (page += 1)}>
        Weiter
      </button>
    </div>
    <div class="actions">
      <span class="count" aria-live="polite">{selected.length} ausgewählt</span>
      <button type="button" class="tb-btn" onclick={onCancel}>Abbrechen</button>
      <button
        type="button"
        class="btn primary confirm"
        disabled={selected.length === 0}
        onclick={confirm}
      >
        Auswählen
      </button>
    </div>
  </footer>

  {#if preview}
    <Lightbox
      imageIds={[preview.id]}
      caption={preview.originalFilename}
      onClose={() => (preview = null)}
    />
  {/if}
</div>

<style>
  .image-picker {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  header h3 {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin: 0;
  }
  .close {
    width: 34px;
    height: 34px;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: 7px;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
  }
  .close:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .toolbar {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .search,
  .select {
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 9px 11px;
    border-radius: 6px;
    appearance: none;
  }
  .search {
    flex: 1;
    min-width: 140px;
  }
  .search:focus,
  .select:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface);
  }
  .checkbox {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .tb-btn {
    display: inline-flex;
    align-items: center;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 9px 14px;
    border-radius: 7px;
    cursor: pointer;
  }
  .tb-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .tb-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 14px;
  }
  .grid > li {
    position: relative;
  }
  .thumb {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    border-radius: 2px;
  }
  .zoom {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 2;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 50%;
    background: rgba(16, 22, 32, 0.62);
    color: #fff;
    cursor: pointer;
  }
  .zoom:hover,
  .zoom:focus-visible {
    background: rgba(16, 22, 32, 0.88);
    outline: none;
  }
  .thumb .mat {
    display: block;
    background: var(--surface);
    padding: 8px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame-sm);
    transition: box-shadow 0.12s;
  }
  .thumb .frame {
    display: block;
    border: 1px solid var(--keyline);
    aspect-ratio: 1 / 1;
    overflow: hidden;
    line-height: 0;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb:focus-visible {
    outline: none;
  }
  .thumb:focus-visible .mat,
  .thumb:hover .mat {
    box-shadow:
      0 0 0 2px var(--accent),
      var(--shadow-frame-sm);
  }
  .thumb.selected .mat {
    box-shadow:
      0 0 0 3px var(--accent),
      var(--shadow-frame-sm);
  }
  .pager {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .page-label {
    font-size: 13px;
    color: var(--muted);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .confirm {
    padding: 9px 16px;
    font-size: 13px;
  }
  .count {
    font-size: 13px;
    color: var(--faint);
  }
  .uploads {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pending {
    font-size: 13px;
    color: var(--muted);
  }
  .err {
    color: #b4452f;
    font-size: 13px;
  }
  .empty {
    color: var(--faint);
    font-style: italic;
  }
</style>
