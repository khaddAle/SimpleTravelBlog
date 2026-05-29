<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto } from '@stb/shared';
  import { api, ApiError } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import BlockRenderer from '../blocks/BlockRenderer.svelte';

  let { params }: { params: { id: string } } = $props();

  let post = $state<PostDto | null>(null);
  let status = $state<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  onMount(async () => {
    try {
      post = await api.publicPost(params.id);
      status = 'ok';
    } catch (err) {
      status = err instanceof ApiError && err.status === 404 ? 'notfound' : 'error';
    }
  });
</script>

{#if status === 'loading'}
  <p>Lädt…</p>
{:else if status === 'notfound'}
  <p role="alert">Beitrag nicht gefunden.</p>
  <a href="#/archiv">← Zum Archiv</a>
{:else if status === 'error'}
  <p role="alert">Fehler beim Laden.</p>
{:else if post}
  <article class="post">
    <a class="back" href="#/archiv">← Zurück</a>
    <h1>{post.title}</h1>
    {#if post.subtitle}
      <p class="subtitle">{post.subtitle}</p>
    {/if}
    <p class="meta">{formatDate(post.postDate)} · {post.placeName}, {post.country}</p>
    {#each post.blocks as block, index (index)}
      <BlockRenderer {block} />
    {/each}
  </article>
{/if}

<style>
  .post {
    max-width: 720px;
    margin: 0 auto;
  }
  .subtitle {
    font-size: 1.2rem;
    color: #4a5568;
  }
  .meta {
    color: #718096;
    font-size: 0.9rem;
  }
</style>
