<script lang="ts">
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
  // Heads are served newest → oldest, so the *previous* neighbour is the newer
  // post (one step up the list) and the *next* neighbour is the older one.
  let prevPost = $state<PublicPostHead | null>(null);
  let nextPost = $state<PublicPostHead | null>(null);
  // The trip this post belongs to (its source "Reise"), resolved best-effort.
  let tripName = $state<string | null>(null);

  // The lead image is the post's first image block — it bleeds wide at r169.
  const leadIndex = $derived(post ? post.blocks.findIndex((b) => b.type === 'image') : -1);

  // svelte-spa-router keeps this component mounted across /beitrag/:id changes and
  // only swaps `params`, so the load is driven by an effect on `params.id` (not a
  // one-shot onMount) — otherwise the prev/next links change the URL but never
  // reload the article. The captured `id` guards against a stale in-flight load
  // clobbering a newer one when the reader clicks through quickly.
  async function load(id: string): Promise<void> {
    status = 'loading';
    post = null;
    prevPost = null;
    nextPost = null;
    tripName = null;
    let loaded: PostDto;
    try {
      loaded = await api.publicPost(id);
    } catch (err) {
      if (params.id !== id) return;
      status = err instanceof ApiError && err.status === 404 ? 'notfound' : 'error';
      return;
    }
    if (params.id !== id) return;
    post = loaded;
    status = 'ok';
    // Neighbour links and the Reise source link are niceties — never let a list
    // failure break the article. allSettled keeps each independent.
    const [headsResult, tripsResult] = await Promise.allSettled([
      api.publicPostHeads(),
      api.publicTrips(),
    ]);
    if (params.id !== id) return;
    if (headsResult.status === 'fulfilled') {
      const heads = headsResult.value;
      const here = heads.findIndex((p) => p.id === id);
      prevPost = here > 0 ? (heads[here - 1] ?? null) : null;
      nextPost = here >= 0 && here + 1 < heads.length ? (heads[here + 1] ?? null) : null;
    }
    if (tripsResult.status === 'fulfilled' && loaded.tripId) {
      tripName = tripsResult.value.find((t) => t.id === loaded.tripId)?.name ?? null;
    }
  }

  $effect(() => {
    void load(params.id);
    // The component isn't remounted on a post→post nav, so reset the scroll.
    window.scrollTo({ top: 0 });
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
        {#if tripName && post.tripId}
          <a class="link-accent reise-link" href={`#/archiv?reise=${post.tripId}`}>
            Reise: {tripName}
          </a>
        {/if}
      </div>
    </div>

    {#each post.blocks as block, i (i)}
      <BlockRenderer {block} lead={i === leadIndex} images={post.images} />
    {/each}

    <div class="wrap-narrow">
      <nav class="article-nav">
        {#if prevPost}
          <a class="prev" href={`#/beitrag/${prevPost.id}`}>
            <span class="lbl">Vorheriger Beitrag</span><span class="ttl">← {prevPost.title}</span>
          </a>
        {:else}
          <span class="slot"></span>
        {/if}
        {#if nextPost}
          <a class="next" href={`#/beitrag/${nextPost.id}`}>
            <span class="lbl">Nächster Beitrag</span><span class="ttl">{nextPost.title} →</span>
          </a>
        {:else}
          <span class="slot"></span>
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
  /* Reise source link: a quiet, accented affordance under the meta line. */
  .reise-link {
    display: inline-block;
    margin-top: 14px;
    font-size: 14px;
  }
  /* Two-slot prev/next nav: newer on the left, older on the right. An absent
     side renders an empty .slot so the present side keeps its edge. */
  .article-nav .ttl {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }
  .article-nav a:hover .ttl {
    color: var(--accent);
  }
  .article-nav .next {
    text-align: right;
  }
  @media (max-width: 600px) {
    .article-nav {
      flex-direction: column;
      gap: 22px;
    }
    .article-nav .next {
      text-align: left;
    }
    /* A missing neighbour shouldn't reserve vertical space when stacked. */
    .article-nav .slot {
      display: none;
    }
  }
</style>
