<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import AdminLayout from './AdminLayout.svelte';

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

<AdminLayout>
  <div class="head">
    <h1>Beiträge</h1>
    <a class="new" href="#/admin/neu">Neuer Beitrag</a>
  </div>

  {#if loading}
    <p>Lädt…</p>
  {:else if posts.length === 0}
    <p>Noch keine Beiträge.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Titel</th>
          <th>Status</th>
          <th>Datum</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each posts as post (post.id)}
          <tr>
            <td><a href={`#/admin/beitrag/${post.id}`}>{post.title}</a></td>
            <td>{statusLabel(post.status)}</td>
            <td>{formatDate(post.postDate)}</td>
            <td>
              <button type="button" aria-label={`${post.title} löschen`} onclick={() => remove(post)}>
                Löschen
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</AdminLayout>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid #edf2f7;
  }
</style>
