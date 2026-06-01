<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import type { TripDto, CreatePostRequest, UpdatePostRequest, Block } from '@stb/shared';
  import { api, ApiError } from '../lib/api.js';
  import type { PostMetadata } from '../lib/types.js';
  import { collectImageIds } from '../lib/imageRefs.js';
  import { navGuard } from '../lib/navGuard.js';
  import AdminLayout from './AdminLayout.svelte';
  import MetadataSidebar from './editor/MetadataSidebar.svelte';
  import BlockEditor from './editor/BlockEditor.svelte';
  import ImagePicker from './editor/ImagePicker.svelte';

  let { params }: { params?: { id?: string } } = $props();
  const editId = $derived(params?.id);

  let metadata = $state<PostMetadata>({
    title: '',
    postDate: new Date().toISOString(),
    country: '',
    placeName: '',
    lat: 51.1657,
    lng: 10.4515,
  });
  let blocks = $state<Block[]>([]);
  // Saved status, seeded from the loaded post (new posts start as a draft);
  // drives the status pill in the bar.
  let status = $state<'draft' | 'published'>('draft');
  // Images already placed in this (possibly unsaved) post — hidden from the
  // "Nur unbenutzte" picker so freshly-selected images stop showing as unused.
  const usedImageIds = $derived(collectImageIds(blocks, metadata.coverImageId));
  let trips = $state<TripDto[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  // Unsaved-changes tracking: snapshot the loaded state, then compare live.
  // `null` until the post has loaded, so we never report dirty mid-load.
  let initialSnapshot = $state<string | null>(null);
  const isDirty = $derived.by(
    () => initialSnapshot !== null && JSON.stringify({ metadata, blocks }) !== initialSnapshot,
  );

  // Image-picker modal: a Promise-based bridge so BlockEditor can `await` a pick.
  let pickerMode = $state<null | 'single' | 'multiple'>(null);
  let pickerOrphansOnly = $state(false);
  let pickerSelected = $state<string[]>([]);
  let pickerResolve: ((ids: string[] | null) => void) | null = null;

  interface PickOpts {
    orphansOnly?: boolean;
    selected?: string[];
  }

  onMount(async () => {
    try {
      trips = await api.listTrips();
      if (editId) {
        const post = await api.getPost(editId);
        status = post.status;
        metadata = {
          title: post.title,
          postDate: post.postDate,
          country: post.country,
          placeName: post.placeName,
          lat: post.lat,
          lng: post.lng,
          ...(post.subtitle ? { subtitle: post.subtitle } : {}),
          ...(post.tripId ? { tripId: post.tripId } : {}),
          ...(post.coverImageId ? { coverImageId: post.coverImageId } : {}),
        };
        blocks = post.blocks;
      }
    } finally {
      // Baseline for dirty-tracking, captured after any loaded data is applied.
      initialSnapshot = JSON.stringify({ metadata, blocks });
      loading = false;
    }
  });

  // In-app departures (admin nav, logout) consult this guard; it confirms only
  // while there are unsaved edits.
  $effect(() => navGuard.register(() => isDirty));

  // Tab close / reload / external navigation: warn via the browser's native
  // prompt, but only while dirty (attached/detached as the flag flips).
  $effect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  function openPicker(mode: 'single' | 'multiple', opts?: PickOpts): Promise<string[] | null> {
    return new Promise((resolve) => {
      pickerMode = mode;
      pickerOrphansOnly = opts?.orphansOnly ?? false;
      pickerSelected = opts?.selected ?? [];
      pickerResolve = resolve;
    });
  }
  function pickImage(opts?: PickOpts): Promise<string | null> {
    return openPicker('single', opts).then((ids) => (ids && ids[0] ? ids[0] : null));
  }
  function pickGallery(opts?: PickOpts): Promise<string[] | null> {
    return openPicker('multiple', opts);
  }
  function closePicker(): void {
    pickerMode = null;
    pickerOrphansOnly = false;
    pickerSelected = [];
    pickerResolve = null;
  }
  function onPickerSelect(ids: string[]): void {
    pickerResolve?.(ids);
    closePicker();
  }
  function onPickerCancel(): void {
    pickerResolve?.(null);
    closePicker();
  }

  /**
   * Required metadata the post DTO enforces server-side. Validate it here so a
   * gap (e.g. an empty Land/Ortsname) yields a precise German hint instead of an
   * opaque "Speichern fehlgeschlagen." after a rejected round-trip.
   */
  function missingRequiredFields(): string[] {
    const missing: string[] = [];
    if (!metadata.title.trim()) missing.push('Titel');
    if (!/^[A-Z]{2}$/.test(metadata.country)) missing.push('Land (ISO-Code, z. B. DE)');
    if (!metadata.placeName.trim()) missing.push('Ortsname');
    return missing;
  }

  function buildBody(): CreatePostRequest {
    return {
      title: metadata.title,
      ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
      postDate: metadata.postDate,
      country: metadata.country,
      placeName: metadata.placeName,
      lat: metadata.lat,
      lng: metadata.lng,
      ...(metadata.tripId ? { tripId: metadata.tripId } : {}),
      ...(metadata.coverImageId ? { coverImageId: metadata.coverImageId } : {}),
      blocks,
    };
  }

  async function save(next: 'draft' | 'published'): Promise<void> {
    error = '';
    const missing = missingRequiredFields();
    if (missing.length > 0) {
      error = `Bitte Pflichtfelder ausfüllen: ${missing.join(', ')}.`;
      return;
    }
    saving = true;
    try {
      if (editId) {
        const body: UpdatePostRequest = { ...buildBody(), status: next };
        await api.updatePost(editId, body);
      } else {
        const created = await api.createPost(buildBody());
        if (next === 'published') await api.updatePost(created.id, { status: 'published' });
      }
      status = next;
      // Saved state is now the baseline, so leaving afterwards isn't guarded.
      initialSnapshot = JSON.stringify({ metadata, blocks });
      push('/admin');
    } catch (err) {
      // Surface the server's reason for an unexpected failure; keep the plain
      // generic message for non-API errors.
      error =
        err instanceof ApiError
          ? `Speichern fehlgeschlagen: ${err.message}`
          : 'Speichern fehlgeschlagen.';
    } finally {
      saving = false;
    }
  }
</script>

{#snippet barActions()}
  {#if !loading}
    {#if isDirty}
      <span class="saved">Ungespeicherte Änderungen</span>
    {/if}
    <span class="pill {status === 'published' ? 'pub' : 'draft'}">
      {status === 'published' ? 'Veröffentlicht' : 'Entwurf'}
    </span>
    {#if editId}
      <a class="btn ghost preview" href={`#/beitrag/${editId}`} target="_blank" rel="noopener">
        Vorschau
      </a>
    {/if}
  {/if}
{/snippet}

<AdminLayout current="beitraege" actions={barActions}>
  {#if loading}
    <p class="loading">Lädt…</p>
  {:else}
    {#if error}
      <p role="alert" class="err">{error}</p>
    {/if}
    <div class="editor-wrap">
      <div class="sheet">
        <BlockEditor {blocks} onChange={(next) => (blocks = next)} {pickImage} {pickGallery} />
      </div>
      <aside class="side">
        <div class="panel">
          <h3>Status</h3>
          <button
            type="button"
            class="btn primary pub-btn"
            disabled={saving}
            onclick={() => save('published')}
          >
            Veröffentlichen
          </button>
          <button
            type="button"
            class="btn draft-btn"
            disabled={saving}
            onclick={() => save('draft')}
          >
            Entwurf speichern
          </button>
        </div>
        <MetadataSidebar {metadata} {trips} onChange={(next) => (metadata = next)} {pickImage} />
      </aside>
    </div>
  {/if}

  {#if pickerMode}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Bildauswahl">
      <div class="modal-body">
        <ImagePicker
          mode={pickerMode}
          initialOrphansOnly={pickerOrphansOnly}
          initialSelected={pickerSelected}
          excludeIds={usedImageIds}
          excludePostId={editId}
          onSelect={onPickerSelect}
          onCancel={onPickerCancel}
        />
      </div>
    </div>
  {/if}
</AdminLayout>

<style>
  /* bar actions (rendered into AdminLayout's bar via the snippet) */
  .saved {
    font-size: 12px;
    color: var(--faint);
  }
  .pill {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 4px 9px;
    border-radius: 100px;
  }
  .pill.draft {
    background: #f3e6c8;
    color: #8a6a1f;
  }
  .pill.pub {
    background: #cfe8d6;
    color: #1f7a43;
  }
  .preview {
    padding: 8px 13px;
    font-size: 13px;
  }

  .loading {
    color: var(--muted);
  }
  .editor-wrap {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 34px;
    align-items: start;
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame);
    padding: 18px 20px;
  }
  .side {
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .panel {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
    padding: 18px;
  }
  .panel h3 {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
    margin: 0 0 14px;
  }
  .pub-btn {
    width: 100%;
    justify-content: center;
  }
  .draft-btn {
    width: 100%;
    justify-content: center;
    margin-top: 10px;
  }
  .err {
    color: #b4452f;
    background: #f7e4df;
    padding: 11px 14px;
    margin: 0 0 20px;
    font-size: 14px;
    font-weight: 500;
  }
  @media (max-width: 920px) {
    .editor-wrap {
      grid-template-columns: 1fr;
      gap: 20px;
    }
    .side {
      position: static;
    }
  }
  @media (max-width: 640px) {
    .saved {
      display: none;
    }
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(16, 22, 32, 0.55);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    /* Above Leaflet, whose controls sit at z-index 1000 — without this the
       location-picker map paints over the image-picker dialog. */
    z-index: 2000;
  }
  .modal-body {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-pop);
    padding: 22px 24px;
    width: min(760px, 94vw);
    max-height: 88vh;
    overflow: auto;
  }
</style>
