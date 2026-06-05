<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto, PublicPostHead } from '@stb/shared';
  import { api, ApiError } from '../lib/api.js';
  import { formatDate } from '../lib/dates.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import BlockRenderer from '../blocks/BlockRenderer.svelte';

  let { params }: { params: { id: string } } = $props();

  let post = $state<PostDto | null>(null);
  let status = $state<'loading' | 'ok' | 'notfound' | 'error'>('loading');
  let nextPost = $state<PublicPostHead | null>(null);

  // The lead image is the post's first image block — it bleeds wide at r169.
  const leadIndex = $derived(post ? post.blocks.findIndex((b) => b.type === 'image') : -1);

  onMount(async () => {
    try {
      post = await api.publicPost(params.id);
      status = 'ok';
    } catch (err) {
      status = err instanceof ApiError && err.status === 404 ? 'notfound' : 'error';
      return;
    }
    // The "next post" link is a nicety — never let a list failure break the page.
    try {
      const heads = await api.publicPostHeads();
      const here = heads.findIndex((p) => p.id === params.id);
      if (here >= 0 && here + 1 < heads.length) nextPost = heads[here + 1] ?? null;
    } catch {
      // ignore — the article still renders without a neighbour link
    }
  });
</script>

<SiteHeader />

<main class="article">
  {#if status === 'loading'}
    <div class="wrap-narrow"><p class="status">Lädt…</p></div>
  {:else if status === 'notfound'}
    <div class="wrap-narrow">
      <p class="status" role="alert">Beitrag nicht gefunden.</p>
      <a class="link-accent" href="#/archiv">← Zum Archiv</a>
    </div>
  {:else if status === 'error'}
    <div class="wrap-narrow"><p class="status" role="alert">Fehler beim Laden.</p></div>
  {:else if post}
    <div class="wrap-narrow">
      <a class="back" href="#/archiv"><span aria-hidden="true">←</span> Alle Beiträge</a>
      <div class="article-head">
        <p class="eyebrow plain">{post.placeName}, {countryName(post.country)}</p>
        <h1 class="title">{post.title}</h1>
        {#if post.subtitle}
          <p class="subtitle">{post.subtitle}</p>
        {/if}
        <div class="post-meta">
          <b>{formatDate(post.postDate)}</b><span class="sep">·</span>{post.placeName}
        </div>
      </div>
    </div>

    {#each post.blocks as block, i (i)}
      <BlockRenderer {block} lead={i === leadIndex} images={post.images} />
    {/each}

    <div class="wrap-narrow">
      <nav class="article-nav">
        <a href="#/archiv"><span class="lbl">Zurück</span>Alle Beiträge</a>
        {#if nextPost}
          <a class="next" href={`#/beitrag/${nextPost.id}`}>
            <span class="lbl">Nächster Beitrag</span>{nextPost.title} →
          </a>
        {/if}
      </nav>
    </div>
  {/if}
</main>

<SiteFooter />

<style>
  .status {
    padding: 60px 0;
    color: var(--muted);
  }
  .article-nav .next {
    text-align: right;
  }
</style>
