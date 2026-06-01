<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { PostDto, TripDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { groupPosts, type CountryGroup } from '../lib/archive.js';
  import { coverImageId } from '../lib/posts.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import Photo from '../components/Photo.svelte';

  // One page is small enough that the country/trip grouping stays readable; the
  // reader pulls more with the "Mehr laden" button rather than numbered pages.
  const PAGE_SIZE = 20;

  let posts = $state<PostDto[]>([]);
  let trips = $state<TripDto[]>([]);
  let serverTotal = $state(0);
  let page = $state(0);
  let loading = $state(true);
  let loadingMore = $state(false);
  let moreButton = $state<HTMLButtonElement>();

  const groups = $derived(groupPosts(posts, trips));
  const loadedCount = $derived(posts.length);
  const hasMore = $derived(loadedCount < serverTotal);
  const summary = $derived(
    `${loadedCount} ${loadedCount === 1 ? 'Beitrag' : 'Beiträge'} aus ` +
      `${groups.length} ${groups.length === 1 ? 'Land' : 'Ländern'}, gegliedert nach Reisen.`,
  );

  function countryCount(group: CountryGroup): number {
    return group.trips.reduce((n, t) => n + t.posts.length, 0);
  }

  function thumb(post: PostDto): string | undefined {
    const id = post.coverImageId ?? coverImageId(post.blocks);
    return id ? imageUrl(id, 'thumb') : undefined;
  }

  onMount(async () => {
    try {
      const [first, loadedTrips] = await Promise.all([
        api.publicPosts(1, PAGE_SIZE),
        api.publicTrips(),
      ]);
      posts = first.items;
      trips = loadedTrips;
      serverTotal = first.total;
      page = 1;
    } finally {
      loading = false;
    }
  });

  async function loadMore(): Promise<void> {
    if (loadingMore || !hasMore) return;
    // Appending into the grouped layout scatters new rows into existing country
    // sections above the button; pin the button to its viewport spot so the page
    // doesn't jump under the reader's cursor.
    const before = moreButton?.getBoundingClientRect().top ?? 0;
    loadingMore = true;
    try {
      const next = await api.publicPosts(page + 1, PAGE_SIZE);
      posts = [...posts, ...next.items];
      serverTotal = next.total;
      page += 1;
    } finally {
      loadingMore = false;
    }
    await tick();
    const after = moreButton?.getBoundingClientRect().top ?? before;
    const delta = after - before;
    if (delta !== 0) window.scrollBy(0, delta);
  }
</script>

<SiteHeader current="archiv" />

<main class="wrap">
  <div class="arch-intro">
    <p class="eyebrow">Archiv</p>
    <h1 class="h-page">Nach Ländern &amp; Reisen</h1>
    {#if !loading && loadedCount > 0}
      <p class="lede stack-16">{summary}</p>
    {/if}
  </div>

  {#if loading}
    <p class="status">Lädt…</p>
  {:else if groups.length === 0}
    <p class="status">Noch keine Beiträge.</p>
  {:else}
    {#each groups as group (group.country)}
      {@const n = countryCount(group)}
      <section class="arch-country">
        <div class="country-head">
          <h2>{countryName(group.country)}</h2>
          <span class="count">{n} {n === 1 ? 'Beitrag' : 'Beiträge'}</span>
        </div>
        {#each group.trips as trip (trip.tripId ?? '_none')}
          <div class="arch-trip">
            <h3 class="trip-label">{trip.tripName ?? 'Einzelne Beiträge'}</h3>
            {#each trip.posts as post (post.id)}
              <a class="arch-row" href={`#/beitrag/${post.id}`}>
                <span class="thumb"><Photo src={thumb(post)} ratio="r43" size="sm" /></span>
                <span class="t">
                  <h4>{post.title}</h4>
                  <div class="where">{post.placeName}, {countryName(post.country)}</div>
                </span>
                <span class="d">{formatDate(post.postDate)}</span>
                <span class="go" aria-hidden="true">→</span>
              </a>
            {/each}
          </div>
        {/each}
      </section>
    {/each}

    {#if hasMore}
      <div class="more">
        <button
          class="more-btn"
          type="button"
          bind:this={moreButton}
          onclick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Lädt…' : 'Mehr laden'}
        </button>
        <p class="more-count">{loadedCount} von {serverTotal} Beiträgen</p>
      </div>
    {/if}
  {/if}
</main>

<SiteFooter />

<style>
  .arch-intro {
    padding: 48px 0 8px;
  }
  .status {
    padding: 24px 0 60px;
    color: var(--muted);
  }
  .arch-country {
    border-top: 1px solid var(--line);
    padding-top: 30px;
    margin-top: 52px;
  }
  .arch-country:first-of-type {
    margin-top: 40px;
  }
  .country-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 6px;
  }
  .country-head h2 {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
    margin: 0;
  }
  .country-head .count {
    font-size: 13px;
    font-weight: 500;
    color: var(--faint);
  }
  .arch-trip {
    margin-top: 26px;
  }
  .trip-label {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 6px;
  }
  .arch-row {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 12px 14px 0;
    border-bottom: 1px solid var(--line-soft);
    text-decoration: none;
    color: inherit;
    border-radius: 4px;
    transition: background 0.12s;
  }
  .arch-row:hover {
    background: color-mix(in srgb, var(--surface) 55%, transparent);
  }
  .arch-row .thumb {
    width: 104px;
    flex: 0 0 auto;
  }
  .arch-row .thumb :global(.photo) {
    padding: 7px;
  }
  .arch-row .t {
    flex: 1 1 auto;
    min-width: 0;
  }
  .arch-row .t h4 {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.3px;
    margin: 0;
  }
  .arch-row .t .where {
    font-size: 12.5px;
    color: var(--faint);
    margin-top: 4px;
  }
  .arch-row .d {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--faint);
    white-space: nowrap;
  }
  .arch-row .go {
    color: var(--faint);
    transition:
      transform 0.15s,
      color 0.15s;
  }
  .arch-row:hover .go {
    color: var(--accent);
    transform: translateX(3px);
  }
  .more {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0 64px;
  }
  .more-btn {
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
    padding: 12px 28px;
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .more-btn:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .more-btn:disabled {
    cursor: default;
    color: var(--faint);
  }
  .more-count {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--faint);
    margin: 0;
  }
  @media (max-width: 600px) {
    .arch-country {
      margin-top: 40px;
      padding-top: 24px;
    }
    .country-head h2 {
      font-size: 26px;
    }
    .arch-row {
      gap: 14px;
    }
    .arch-row .thumb {
      width: 78px;
    }
    .arch-row .go {
      display: none;
    }
    .arch-row .d {
      font-size: 11.5px;
    }
  }
</style>
