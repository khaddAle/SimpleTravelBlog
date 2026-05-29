<script lang="ts">
  import type { ImageDto } from '@stb/shared';
  import { api, ApiError, type PostRef } from '../lib/api.js';
  import AdminLayout from './AdminLayout.svelte';

  let images = $state<ImageDto[]>([]);
  let total = $state(0);
  let page = $state(1);
  const pageSize = 24;
  let q = $state('');
  let orphansOnly = $state(false);
  let loading = $state(true);
  let usage = $state<Record<string, PostRef[]>>({});
  let blocked = $state<{ filename: string; posts: PostRef[] } | null>(null);

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  async function load(): Promise<void> {
    loading = true;
    try {
      const res = await api.listImages({ page, pageSize, q, orphansOnly });
      images = res.items;
      total = res.total;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void q;
    void orphansOnly;
    void page;
    void load();
  });

  async function showUsage(id: string): Promise<void> {
    usage = { ...usage, [id]: await api.imageUsage(id) };
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

  function resetToFirstPage(): void {
    page = 1;
  }
</script>

<AdminLayout>
  <h1>Bildverwaltung</h1>

  <div class="filters">
    <input
      type="search"
      aria-label="Dateiname filtern"
      placeholder="Dateiname filtern"
      bind:value={q}
      oninput={resetToFirstPage}
    />
    <label>
      <input type="checkbox" bind:checked={orphansOnly} onchange={resetToFirstPage} />
      Nur unbenutzte
    </label>
  </div>

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

  {#if loading}
    <p>Lädt…</p>
  {:else if images.length === 0}
    <p>Keine Bilder gefunden.</p>
  {:else}
    <ul class="grid">
      {#each images as image (image.id)}
        <li class="card">
          <img src={image.thumbUrl} alt="" />
          <span class="name">{image.originalFilename}</span>
          <div class="actions">
            <button type="button" onclick={() => showUsage(image.id)}>Verwendung</button>
            <button
              type="button"
              aria-label={`${image.originalFilename} löschen`}
              onclick={() => remove(image)}>Löschen</button
            >
          </div>
          {#if usage[image.id]}
            {#if usage[image.id]!.length === 0}
              <p class="usage">Unbenutzt</p>
            {:else}
              <ul class="usage">
                {#each usage[image.id]! as ref (ref.id)}
                  <li>{ref.title}</li>
                {/each}
              </ul>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>

    <div class="pager">
      <button type="button" disabled={page <= 1} onclick={() => (page -= 1)}>Zurück</button>
      <span>Seite {page} von {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onclick={() => (page += 1)}>Weiter</button>
    </div>
  {/if}
</AdminLayout>

<style>
  .filters {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1rem;
  }
  .card img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    border-radius: 4px;
  }
  .name {
    display: block;
    font-size: 0.8rem;
    word-break: break-all;
  }
  .blocked {
    border: 1px solid #fc8181;
    background: #fff5f5;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }
  .usage {
    font-size: 0.8rem;
    color: #4a5568;
  }
</style>
