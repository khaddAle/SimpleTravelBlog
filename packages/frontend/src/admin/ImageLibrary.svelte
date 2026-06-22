<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { ImageDto } from '@stb/shared';
  import { api, ApiError, type PostRef } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import type { EventSourceFactory } from '../lib/uploads.js';
  import { rememberedSort, rememberSort, type ImageSortKey } from './imageSortMemory.js';
  import AdminLayout from './AdminLayout.svelte';
  import UploadProgress from './editor/UploadProgress.svelte';

  /** Injectable EventSource factory, forwarded to UploadProgress for tests. */
  let { eventSourceFactory }: { eventSourceFactory?: EventSourceFactory } = $props();

  let images = $state<ImageDto[]>([]);
  let total = $state(0);
  let page = $state(1);
  const pageSize = 24;
  let q = $state('');
  // Default to capture-date newest-first; restore the user's last choice for the
  // rest of the session (see imageSortMemory — resets on a full reload).
  let sort = $state<ImageSortKey>(rememberedSort('library', 'taken-newest'));
  $effect(() => {
    rememberSort('library', sort);
  });
  let orphansOnly = $state(false);
  let loading = $state(true);

  let usage = $state<Record<string, PostRef[]>>({});
  // SvelteSet is reactive, so the template's whereOpen.has(...) tracks mutations
  // directly — no clone-and-reassign needed.
  const whereOpen = new SvelteSet<string>();
  let blocked = $state<{ filename: string; posts: PostRef[] } | null>(null);

  let unusedPrompt = $state<{ count: number } | null>(null);
  let bulkBusy = $state(false);

  let selMode = $state(false);
  let selected = $state<string[]>([]);
  let delBusy = $state(false);

  let toastMsg = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // Accepted upload types — the real pipeline (sharp + libheif) handles these.
  const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
  const MAX_CONCURRENT_UPLOADS = 3;
  interface UploadJob {
    key: string;
    filename: string;
    uploadId: string | null;
    error: string | null;
  }
  let jobs = $state<UploadJob[]>([]);

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await api.listImages({ page, pageSize, q, orphansOnly, sort });
      images = res.items;
      total = res.total;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void q;
    void sort;
    void orphansOnly;
    void page;
    void load();
  });

  function resetToFirstPage(): void {
    page = 1;
  }

  function setOrphans(value: boolean): void {
    orphansOnly = value;
    page = 1;
  }

  function showToast(message: string): void {
    toastMsg = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastMsg = ''), 3600);
  }

  async function toggleWhere(id: string): Promise<void> {
    if (whereOpen.has(id)) {
      whereOpen.delete(id);
    } else {
      whereOpen.add(id);
      if (!(id in usage)) usage = { ...usage, [id]: await api.imageUsage(id) };
    }
  }

  async function remove(image: ImageDto): Promise<void> {
    blocked = null;
    try {
      await api.deleteImage(image.id);
      images = images.filter((i) => i.id !== image.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { posts: PostRef[] };
        blocked = { filename: image.originalFilename, posts: body.posts };
      } else {
        throw err;
      }
    }
  }

  // ---- selection mode ----
  function toggleSelMode(): void {
    selMode = !selMode;
    if (!selMode) selected = [];
  }
  function isSelected(id: string): boolean {
    return selected.includes(id);
  }
  function toggleSelected(id: string): void {
    selected = isSelected(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  async function deleteSelected(): Promise<void> {
    if (selected.length === 0) {
      showToast('Keine Bilder ausgewählt.');
      return;
    }
    delBusy = true;
    let deleted = 0;
    let refused = 0;
    try {
      for (const id of selected) {
        try {
          await api.deleteImage(id);
          deleted += 1;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) refused += 1;
          else throw err;
        }
      }
    } finally {
      delBusy = false;
    }
    selected = [];
    if (refused && deleted) {
      showToast(`${deleted} gelöscht · ${refused} werden in Beiträgen verwendet und bleiben erhalten.`);
    } else if (refused) {
      showToast(`${refused} Bild(er) werden in Beiträgen verwendet und können nicht gelöscht werden.`);
    } else {
      showToast(`${deleted} Bild(er) gelöscht.`);
    }
    await load();
  }

  // ---- bulk delete of all unused ----
  async function promptDeleteUnused(): Promise<void> {
    unusedPrompt = { count: await api.unusedImageCount() };
  }
  async function confirmDeleteUnused(): Promise<void> {
    bulkBusy = true;
    try {
      await api.deleteUnusedImages();
      unusedPrompt = null;
      await load();
    } finally {
      bulkBusy = false;
    }
  }

  // ---- upload ----
  function patchJob(key: string, patch: Partial<UploadJob>): void {
    jobs = jobs.map((job) => (job.key === key ? { ...job, ...patch } : job));
  }
  async function onFileChange(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    const queue = [...files];
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, queue.length) }, () =>
      uploadWorker(queue),
    );
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
        patchJob(key, { error: err instanceof Error ? err.message : 'Upload fehlgeschlagen' });
      }
    }
  }
  function onUploadDone(key: string, image: ImageDto): void {
    jobs = jobs.filter((job) => job.key !== key);
    showToast(`„${image.originalFilename}" hochgeladen.`);
    void load();
  }
</script>

<AdminLayout current="bilder">
  <div class="lib-head">
    <div>
      <h1>Bildbibliothek</h1>
      <p>Hochgeladene Bilder werden als WebP gespeichert (Anzeige + Vorschau). Originale werden verworfen.</p>
    </div>
  </div>

  <div class="toolbar">
    <div class="search">
      <input
        type="search"
        aria-label="Nach Dateiname suchen"
        placeholder="Nach Dateiname suchen …"
        autocomplete="off"
        bind:value={q}
        oninput={resetToFirstPage}
      />
    </div>
    <select aria-label="Sortierung" bind:value={sort} onchange={resetToFirstPage}>
      <option value="newest">Neueste zuerst</option>
      <option value="oldest">Älteste zuerst</option>
      <option value="filename">Name A–Z</option>
      <option value="taken-newest">Aufnahmedatum (neueste)</option>
      <option value="taken-oldest">Aufnahmedatum (älteste)</option>
    </select>
    <div class="seg">
      <button type="button" class:on={!orphansOnly} onclick={() => setOrphans(false)}>Alle</button>
      <button type="button" class:on={orphansOnly} onclick={() => setOrphans(true)}>Verwaist</button>
    </div>
    <span class="grow"></span>
    <label class="tb-btn upload-btn">
      Bild hochladen
      <input
        type="file"
        class="sr-only"
        aria-label="Hochladen"
        accept={ACCEPT}
        multiple
        onchange={onFileChange}
      />
    </label>
    <button type="button" class="tb-btn" onclick={promptDeleteUnused}>Unbenutzte löschen</button>
    <button type="button" class="tb-btn" onclick={toggleSelMode}>
      {selMode ? 'Fertig' : 'Auswählen'}
    </button>
    {#if selMode}
      <button type="button" class="tb-btn danger" disabled={delBusy} onclick={deleteSelected}>
        Löschen ({selected.length})
      </button>
    {/if}
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
              onDone={(image) => onUploadDone(job.key, image)}
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

  {#if unusedPrompt}
    <div class="confirm" role="dialog" aria-modal="true" aria-label="Unbenutzte Bilder löschen">
      {#if unusedPrompt.count === 0}
        <p>Es gibt keine unbenutzten Bilder.</p>
        <div class="confirm-actions">
          <button type="button" onclick={() => (unusedPrompt = null)}>Schließen</button>
        </div>
      {:else}
        <p>
          <strong>{unusedPrompt.count}</strong> unbenutzte
          {unusedPrompt.count === 1 ? 'Bild wird' : 'Bilder werden'} unwiderruflich gelöscht. Fortfahren?
        </p>
        <div class="confirm-actions">
          <button type="button" disabled={bulkBusy} onclick={() => (unusedPrompt = null)}>Abbrechen</button>
          <button type="button" class="danger" disabled={bulkBusy} onclick={confirmDeleteUnused}>Löschen</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if blocked}
    <div class="blocked" role="alert">
      <p>„{blocked.filename}" wird noch verwendet in:</p>
      <ul>
        {#each blocked.posts as ref (ref.id)}
          <li><a href={`#/admin/beitrag/${ref.id}`}>{ref.title}</a></li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="count">{total} {total === 1 ? 'Bild' : 'Bilder'}</div>

  {#if loading}
    <p class="status">Lädt…</p>
  {:else if images.length === 0}
    <p class="status">Keine Bilder gefunden.</p>
  {:else}
    <div class="grid">
      {#each images as image (image.id)}
        <div class="img-card" class:sel={isSelected(image.id)}>
          {#if selMode}
            <label class="selbox">
              <input
                type="checkbox"
                class="sr-only"
                aria-label={`${image.originalFilename} auswählen`}
                checked={isSelected(image.id)}
                onchange={() => toggleSelected(image.id)}
              />
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l3 3 6-7" /></svg>
            </label>
          {/if}
          <div class="thumb"><div class="inner"><img src={image.thumbUrl} alt="" /></div></div>
          <div class="body">
            <div class="fn">{image.originalFilename}</div>
            <div class="mi">{formatDate(image.createdAt)}</div>
            {#if !selMode}
              <div class="card-actions">
                <button type="button" class="usage-toggle" onclick={() => toggleWhere(image.id)}>
                  Wo verwendet?
                </button>
                <button
                  type="button"
                  class="del-link"
                  aria-label={`${image.originalFilename} löschen`}
                  onclick={() => remove(image)}>Löschen</button
                >
              </div>
              {#if whereOpen.has(image.id)}
                <div class="where show">
                  {#if usage[image.id] && usage[image.id]!.length > 0}
                    {#each usage[image.id]! as ref (ref.id)}
                      <a href={`#/admin/beitrag/${ref.id}`}>{ref.title}</a>
                    {/each}
                  {:else}
                    <span class="none">Wird in keinem Beitrag verwendet.</span>
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="pager">
      <button type="button" disabled={page <= 1} onclick={() => (page -= 1)}>Zurück</button>
      <span>Seite {page} von {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onclick={() => (page += 1)}>Weiter</button>
    </div>
  {/if}
</AdminLayout>

{#if toastMsg}
  <div class="toast show" role="status">{toastMsg}</div>
{/if}

<style>
  .lib-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }
  .lib-head h1 {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.8px;
    margin: 0;
  }
  .lib-head p {
    margin: 6px 0 0;
    font-size: 13.5px;
    color: var(--muted);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    background: #fff;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
    padding: 12px;
    margin-bottom: 22px;
  }
  .toolbar .search {
    flex: 1 1 220px;
  }
  .toolbar input[type='search'],
  .toolbar select {
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 10px 12px;
    border-radius: 7px;
    appearance: none;
  }
  .toolbar input[type='search'] {
    width: 100%;
  }
  .toolbar input:focus,
  .toolbar select:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
  }
  .grow {
    flex: 1;
  }
  .seg {
    display: flex;
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 3px;
    border-radius: 8px;
  }
  .seg button {
    border: none;
    background: transparent;
    padding: 8px 13px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    border-radius: 6px;
    cursor: pointer;
  }
  .seg button.on {
    background: #fff;
    color: var(--ink);
    box-shadow: 0 1px 3px rgba(18, 28, 46, 0.12);
  }
  .tb-btn {
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    background: #fff;
    border: 1px solid var(--line);
    padding: 10px 14px;
    border-radius: 7px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .tb-btn:hover {
    border-color: var(--accent);
  }
  .tb-btn.danger {
    color: #fff;
    background: #b4452f;
    border-color: #b4452f;
  }
  .tb-btn.danger:hover {
    background: #9a3826;
  }
  .upload-btn {
    cursor: pointer;
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

  .uploads {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .uploads .err {
    color: #b4452f;
  }

  .count {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 14px;
    font-weight: 500;
  }
  .status {
    color: var(--muted);
    padding: 20px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
    gap: 20px;
  }
  .img-card {
    position: relative;
    background: #fff;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
  }
  .img-card.sel {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .selbox {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid #fff;
    background: rgba(18, 28, 46, 0.35);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
  }
  .img-card.sel .selbox {
    background: var(--accent);
  }
  .selbox svg {
    opacity: 0;
  }
  .img-card.sel .selbox svg {
    opacity: 1;
  }
  .thumb {
    position: relative;
    padding: 10px;
  }
  .thumb .inner {
    border: 1px solid var(--keyline);
    aspect-ratio: 1/1;
    overflow: hidden;
    line-height: 0;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    padding: 2px 13px 13px;
  }
  .fn {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.1px;
    word-break: break-all;
  }
  .mi {
    font-size: 11.5px;
    color: var(--faint);
    margin-top: 4px;
  }
  .card-actions {
    margin-top: 9px;
    display: flex;
    gap: 14px;
  }
  .usage-toggle,
  .del-link {
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .usage-toggle {
    color: var(--accent);
  }
  .del-link {
    color: #b4452f;
  }
  .del-link:hover,
  .usage-toggle:hover {
    text-decoration: underline;
  }
  .where {
    margin-top: 9px;
    border-top: 1px solid var(--line-soft);
    padding-top: 9px;
  }
  .where a {
    display: block;
    font-size: 12.5px;
    color: var(--accent);
    text-decoration: none;
    padding: 3px 0;
  }
  .where a:hover {
    text-decoration: underline;
  }
  .where .none {
    font-size: 12.5px;
    color: var(--faint);
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 26px;
    font-size: 13px;
    color: var(--muted);
  }
  .pager button {
    font: inherit;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 7px 12px;
    cursor: pointer;
  }
  .pager button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .confirm {
    border: 1px solid #e0b65c;
    background: #fbf3e1;
    padding: 14px 16px;
    border-radius: 8px;
    margin-bottom: 18px;
  }
  .confirm-actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }
  .confirm-actions button {
    font: inherit;
    font-weight: 600;
    border: 1px solid var(--line);
    background: #fff;
    border-radius: 7px;
    padding: 8px 14px;
    cursor: pointer;
  }
  .confirm-actions .danger {
    color: #fff;
    background: #b4452f;
    border-color: #b4452f;
  }
  .blocked {
    border: 1px solid #eccabf;
    background: #f7e4df;
    color: #7c2f1d;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 18px;
  }
  .blocked a {
    color: #7c2f1d;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translate(-50%, 0);
    background: #1b2330;
    color: #fff;
    padding: 13px 18px;
    border-radius: 9px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
    font-size: 13.5px;
    max-width: 90vw;
    text-align: center;
    z-index: 90;
  }
</style>
