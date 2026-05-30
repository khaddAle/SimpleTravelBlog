<script lang="ts">
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import type { TripDto, CreatePostRequest, UpdatePostRequest, Block } from '@stb/shared';
  import { api } from '../lib/api.js';
  import type { PostMetadata } from '../lib/types.js';
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
  let trips = $state<TripDto[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');

  // Image-picker modal: a Promise-based bridge so BlockEditor can `await` a pick.
  let pickerMode = $state<null | 'single' | 'multiple'>(null);
  let pickerResolve: ((ids: string[] | null) => void) | null = null;

  onMount(async () => {
    try {
      trips = await api.listTrips();
      if (editId) {
        const post = await api.getPost(editId);
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
      loading = false;
    }
  });

  function openPicker(mode: 'single' | 'multiple'): Promise<string[] | null> {
    return new Promise((resolve) => {
      pickerMode = mode;
      pickerResolve = resolve;
    });
  }
  function pickImage(): Promise<string | null> {
    return openPicker('single').then((ids) => (ids && ids[0] ? ids[0] : null));
  }
  function pickGallery(): Promise<string[] | null> {
    return openPicker('multiple');
  }
  function onPickerSelect(ids: string[]): void {
    pickerResolve?.(ids);
    pickerMode = null;
    pickerResolve = null;
  }
  function onPickerCancel(): void {
    pickerResolve?.(null);
    pickerMode = null;
    pickerResolve = null;
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

  async function save(status: 'draft' | 'published'): Promise<void> {
    saving = true;
    error = '';
    try {
      if (editId) {
        const body: UpdatePostRequest = { ...buildBody(), status };
        await api.updatePost(editId, body);
      } else {
        const created = await api.createPost(buildBody());
        if (status === 'published') await api.updatePost(created.id, { status: 'published' });
      }
      push('/admin');
    } catch {
      error = 'Speichern fehlgeschlagen.';
    } finally {
      saving = false;
    }
  }
</script>

<AdminLayout>
  <h1>{editId ? 'Beitrag bearbeiten' : 'Neuer Beitrag'}</h1>

  {#if loading}
    <p>Lädt…</p>
  {:else}
    {#if error}
      <p role="alert" class="err">{error}</p>
    {/if}
    <div class="editor-grid">
      <section class="content">
        <h2>Inhalt</h2>
        <BlockEditor {blocks} onChange={(next) => (blocks = next)} {pickImage} {pickGallery} />
      </section>
      <MetadataSidebar {metadata} {trips} onChange={(next) => (metadata = next)} {pickImage} />
    </div>
    <div class="save-bar">
      <button type="button" disabled={saving} onclick={() => save('draft')}>
        Entwurf speichern
      </button>
      <button type="button" disabled={saving} onclick={() => save('published')}>
        Veröffentlichen
      </button>
    </div>
  {/if}

  {#if pickerMode}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Bildauswahl">
      <div class="modal-body">
        <ImagePicker mode={pickerMode} onSelect={onPickerSelect} onCancel={onPickerCancel} />
      </div>
    </div>
  {/if}
</AdminLayout>

<style>
  .editor-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 1.5rem;
  }
  .save-bar {
    margin-top: 1.5rem;
    display: flex;
    gap: 0.75rem;
  }
  .err {
    color: #c53030;
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    /* Above Leaflet, whose controls sit at z-index 1000 — without this the
       location-picker map paints over the image-picker dialog. */
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
