<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import { countryName } from '../lib/countries.js';
  import { imageUrl } from '../lib/images.js';
  import AdminLayout from './AdminLayout.svelte';
  import Photo from '../components/Photo.svelte';

  let posts = $state<PostDto[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      posts = await api.listPosts();
    } finally {
      loading = false;
    }
  });

  async function remove(post: PostDto): Promise<void> {
    if (!globalThis.confirm(`„${post.title}" löschen?`)) return;
    await api.deletePost(post.id);
    posts = posts.filter((p) => p.id !== post.id);
  }

  function statusLabel(status: PostDto['status']): string {
    return status === 'published' ? 'Veröffentlicht' : 'Entwurf';
  }
</script>

<AdminLayout current="beitraege">
  <div class="list-head">
    <div>
      <span class="eyebrow plain">Redaktion</span>
      <h1 class="h-page">Beiträge</h1>
    </div>
    <a class="btn primary" href="#/admin/neu">Neuer Beitrag</a>
  </div>

  {#if loading}
    <p class="state">Lädt…</p>
  {:else if posts.length === 0}
    <p class="state">Noch keine Beiträge.</p>
  {:else}
    <div class="sheet">
      {#each posts as post (post.id)}
        <div class="post-row">
          <a class="thumb" href={`#/admin/beitrag/${post.id}`} aria-hidden="true" tabindex="-1">
            <Photo
              ratio="r43"
              size="sm"
              src={post.coverImageId ? imageUrl(post.coverImageId, 'thumb') : undefined}
            />
          </a>
          <div class="row-main">
            <a class="row-title" href={`#/admin/beitrag/${post.id}`}>{post.title}</a>
            <div class="row-meta">
              {post.placeName}, {countryName(post.country)}
              <span class="dot">·</span>
              {formatDate(post.postDate)}
            </div>
          </div>
          <span class="pill {post.status === 'published' ? 'pub' : 'draft'}">
            {statusLabel(post.status)}
          </span>
          <button
            type="button"
            class="del"
            aria-label={`${post.title} löschen`}
            onclick={() => remove(post)}
          >
            Löschen
          </button>
        </div>
      {/each}
    </div>
  {/if}
</AdminLayout>

<style>
  .list-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 28px;
  }
  .eyebrow {
    margin-bottom: 10px;
  }
  .state {
    color: var(--muted);
  }
  .sheet {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
  }
  .post-row {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line-soft);
  }
  .post-row:last-child {
    border-bottom: 0;
  }
  .thumb {
    flex: 0 0 104px;
    width: 104px;
    display: block;
  }
  .thumb :global(.photo) {
    padding: 6px;
  }
  .row-main {
    flex: 1;
    min-width: 0;
  }
  .row-title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.3px;
    color: var(--ink);
    text-decoration: none;
  }
  .row-title:hover {
    color: var(--accent);
  }
  .row-meta {
    margin-top: 5px;
    font-size: 13px;
    color: var(--faint);
  }
  .dot {
    margin: 0 6px;
    color: var(--line);
  }
  .pill {
    flex: 0 0 auto;
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
  .del {
    flex: 0 0 auto;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 8px 13px;
    border-radius: 7px;
    cursor: pointer;
  }
  .del:hover {
    border-color: #b4452f;
    color: #b4452f;
  }
  @media (max-width: 640px) {
    .post-row {
      flex-wrap: wrap;
      gap: 12px;
    }
    .thumb {
      flex-basis: 76px;
      width: 76px;
    }
    .row-main {
      flex: 1 1 50%;
    }
  }
</style>
