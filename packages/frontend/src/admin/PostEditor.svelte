<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { push, replace } from 'svelte-spa-router';
  import type { TripDto, CreatePostRequest, PostDto, PostDraft, Block } from '@stb/shared';
  import { api, ApiError } from '../lib/api.js';
  import type { PostMetadata } from '../lib/types.js';
  import { collectImageIds } from '../lib/imageRefs.js';
  import { navGuard } from '../lib/navGuard.js';
  import { createAutosaver } from '../lib/autosave.js';
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
  // The post's id once it exists. New posts have none until autosave (or publish)
  // creates them; kept separate from the route's `editId` so the create→edit URL
  // swap (`replace`) can't retrigger the one-shot load in onMount.
  let postId = $state<string | undefined>(undefined);
  // Saved status, seeded from the loaded post (new posts start as a draft);
  // drives the status pill in the bar.
  let status = $state<'draft' | 'published'>('draft');
  // A published post has unpublished autosaved edits stashed in a draft snapshot.
  let hasPendingDraft = $state(false);
  // Autosave lifecycle, for the bar's save indicator.
  let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Bumped to remount the block editor + metadata sidebar when we reseed the
  // form externally (discarding a draft): both copy their props once on mount.
  let reseedToken = $state(0);
  // Images already placed in this (possibly unsaved) post — hidden from the
  // "Nur unbenutzte" picker so freshly-selected images stop showing as unused.
  const usedImageIds = $derived(collectImageIds(blocks, metadata.coverImageId));
  let trips = $state<TripDto[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state('');

  // Unsaved-changes tracking: the working snapshot vs the last successful
  // autosave. `null` baseline until the post has loaded, so we never report
  // dirty mid-load. "Dirty" here means *not yet autosaved* (not "not published").
  let lastSavedSnapshot = $state<string | null>(null);
  const workingSnapshot = $derived(JSON.stringify({ metadata, blocks }));
  const unsavedDirty = $derived(
    lastSavedSnapshot !== null && workingSnapshot !== lastSavedSnapshot,
  );

  const autosaver = createAutosaver({
    delayMs: 2000,
    maxWaitMs: 15000,
    save: () => autosaveNow(),
  });

  // Image-picker modal: a Promise-based bridge so BlockEditor can `await` a pick.
  let pickerMode = $state<null | 'single' | 'multiple'>(null);
  let pickerOrphansOnly = $state(false);
  let pickerSelected = $state<string[]>([]);
  let pickerResolve: ((ids: string[] | null) => void) | null = null;

  interface PickOpts {
    orphansOnly?: boolean;
    selected?: string[];
  }

  /** Seed the editable form from a post or a draft snapshot (shared field set). */
  function seedFrom(src: PostDto | PostDraft): void {
    metadata = {
      title: src.title,
      postDate: src.postDate,
      country: src.country,
      placeName: src.placeName,
      lat: src.lat,
      lng: src.lng,
      ...(src.subtitle ? { subtitle: src.subtitle } : {}),
      ...(src.tripId ? { tripId: src.tripId } : {}),
      ...(src.coverImageId ? { coverImageId: src.coverImageId } : {}),
    };
    blocks = src.blocks;
  }

  onMount(async () => {
    try {
      trips = await api.listTrips();
      if (editId) {
        postId = editId;
        const post = await api.getPost(editId);
        status = post.status;
        hasPendingDraft = post.draft != null;
        // Continue a pending draft if one exists; otherwise seed from the live post.
        seedFrom(post.draft ?? post);
      }
    } finally {
      // Baseline for dirty-tracking, captured after any loaded data is applied.
      lastSavedSnapshot = JSON.stringify({ metadata, blocks });
      loading = false;
    }
  });

  // Autosave on edit. Gated so a brand-new post stays in memory (with a hint)
  // until its required fields are valid — there's nothing to persist before then.
  $effect(() => {
    const snapshot = workingSnapshot;
    if (loading || lastSavedSnapshot === null) return;
    if (snapshot === lastSavedSnapshot) return;
    if (!postId && missingRequiredFields().length > 0) return;
    autosaver.schedule();
  });

  // Flush a pending autosave when the tab is hidden (best-effort) and on teardown
  // (in-app navigation away), so debounced edits aren't lost.
  $effect(() => {
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void autosaver.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  });
  onDestroy(() => void autosaver.flush());

  // In-app departures (admin nav, logout) consult this guard; it confirms only
  // while there are edits not yet captured by autosave.
  $effect(() => navGuard.register(() => unsavedDirty));

  // Tab close / reload / external navigation: warn via the browser's native
  // prompt, but only while dirty (attached/detached as the flag flips).
  $effect(() => {
    if (!unsavedDirty) return;
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

  function saveFailed(err: unknown): void {
    // Surface the server's reason for an unexpected failure; keep the plain
    // generic message for non-API errors.
    error =
      err instanceof ApiError
        ? `Speichern fehlgeschlagen: ${err.message}`
        : 'Speichern fehlgeschlagen.';
  }

  /**
   * One autosave pass, run by the autosaver at fire time so it reads the latest
   * content. A never-created post is created (as a draft); an existing post saves
   * a draft snapshot — which the server applies to the live doc for a draft post,
   * or stashes without touching the live article for a published one.
   */
  async function autosaveNow(): Promise<void> {
    if (!postId && missingRequiredFields().length > 0) return;
    const snapshot = workingSnapshot;
    const body = buildBody();
    error = '';
    saveState = 'saving';
    try {
      if (!postId) {
        const created = await api.createPost(body);
        postId = created.id;
        status = created.status;
        // Swap the new-post URL for the edit URL via the router (keeps the load
        // in onMount one-shot, so this doesn't retrigger a getPost).
        replace(`/admin/beitrag/${created.id}`);
      } else {
        const ack = await api.savePostDraft(postId, body);
        hasPendingDraft = ack.hasPendingDraft;
      }
      lastSavedSnapshot = snapshot;
      saveState = 'saved';
    } catch (err) {
      saveState = 'error';
      saveFailed(err);
    }
  }

  async function publish(): Promise<void> {
    error = '';
    const missing = missingRequiredFields();
    if (missing.length > 0) {
      error = `Bitte Pflichtfelder ausfüllen: ${missing.join(', ')}.`;
      return;
    }
    busy = true;
    autosaver.cancel();
    try {
      if (!postId) {
        const created = await api.createPost(buildBody());
        postId = created.id;
      } else {
        // Make sure the latest edit is persisted before promoting it.
        await api.savePostDraft(postId, buildBody());
      }
      await api.publishPost(postId);
      status = 'published';
      hasPendingDraft = false;
      lastSavedSnapshot = JSON.stringify({ metadata, blocks });
      push('/admin');
    } catch (err) {
      saveFailed(err);
    } finally {
      busy = false;
    }
  }

  async function discard(): Promise<void> {
    if (!postId) return;
    if (!globalThis.confirm('Nicht veröffentlichte Änderungen verwerfen?')) return;
    error = '';
    busy = true;
    autosaver.cancel();
    try {
      const post = await api.discardDraft(postId);
      seedFrom(post);
      status = post.status;
      hasPendingDraft = false;
      lastSavedSnapshot = JSON.stringify({ metadata, blocks });
      saveState = 'idle';
      reseedToken += 1; // remount the form onto the reverted state

    } catch (err) {
      saveFailed(err);
    } finally {
      busy = false;
    }
  }
</script>

{#snippet barActions()}
  {#if !loading}
    {#if saveState === 'saving'}
      <span class="saved">Speichert…</span>
    {:else if unsavedDirty}
      <span class="saved">Ungespeicherte Änderungen</span>
    {:else if saveState === 'saved'}
      <span class="saved">Gespeichert</span>
    {/if}
    <span class="pill {status === 'published' ? 'pub' : 'draft'}">
      {status === 'published' ? 'Veröffentlicht' : 'Entwurf'}
    </span>
    {#if postId}
      <a class="btn ghost preview" href={`#/beitrag/${postId}`} target="_blank" rel="noopener">
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
      {#key reseedToken}
        <div class="sheet">
          <BlockEditor {blocks} onChange={(next) => (blocks = next)} {pickImage} {pickGallery} />
        </div>
      {/key}
      <aside class="side">
        <div class="panel">
          <h3>Status</h3>
          {#if hasPendingDraft}
            <p class="pending-note">Nicht veröffentlichte Änderungen</p>
          {/if}
          <button
            type="button"
            class="btn primary pub-btn"
            disabled={busy}
            onclick={publish}
          >
            Veröffentlichen
          </button>
          {#if hasPendingDraft}
            <button
              type="button"
              class="btn draft-btn"
              disabled={busy}
              onclick={discard}
            >
              Änderungen verwerfen
            </button>
          {/if}
        </div>
        {#key reseedToken}
          <MetadataSidebar {metadata} {trips} onChange={(next) => (metadata = next)} {pickImage} />
        {/key}
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
          excludePostId={postId}
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
  .pending-note {
    margin: 0 0 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: #2f5597;
    background: #dde6f5;
    padding: 8px 11px;
    border-radius: 7px;
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
