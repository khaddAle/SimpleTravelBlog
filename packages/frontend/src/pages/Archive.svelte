<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublicPostHead, TripDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { groupBy, type GroupMode, type ArchiveGroup } from '../lib/archive.js';
  import { archiveState } from '../lib/archiveState.svelte.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import Photo from '../components/Photo.svelte';

  const MODES: { value: GroupMode; label: string }[] = [
    { value: 'reise', label: 'Nach Reise' },
    { value: 'land', label: 'Nach Land' },
    { value: 'jahr', label: 'Nach Jahr' },
  ];

  let posts = $state<PublicPostHead[]>([]);
  let trips = $state<TripDto[]>([]);
  let loading = $state(true);

  // Grouping mode + open state live in the persisted store, so they survive a
  // round-trip to a post and back. All heads are pulled once; switching mode is a
  // pure client-side regroup.
  const groups = $derived(groupBy(archiveState.mode, posts, trips));
  const openKeys = $derived(archiveState.openByMode[archiveState.mode]);
  const allKeys = $derived(groups.map((g) => g.key));
  const openCount = $derived(allKeys.filter((k) => openKeys.includes(k)).length);

  function isOpen(key: string): boolean {
    return openKeys.includes(key);
  }

  function thumb(post: PublicPostHead): string | undefined {
    return post.coverImageId ? imageUrl(post.coverImageId, 'thumb') : undefined;
  }

  function count(group: ArchiveGroup): string {
    const n = group.posts.length;
    return `${n} ${n === 1 ? 'Beitrag' : 'Beiträge'}`;
  }

  /** `#/archiv?reise=<tripId>` deep-link → open that trip in reise mode. */
  function reiseFromHash(): string | null {
    const hash = window.location.hash;
    const qi = hash.indexOf('?');
    if (qi < 0) return null;
    return new URLSearchParams(hash.slice(qi + 1)).get('reise');
  }

  onMount(async () => {
    const reise = reiseFromHash();
    if (reise) {
      archiveState.setMode('reise');
      archiveState.openGroup('reise', reise);
    }
    try {
      const [heads, loadedTrips] = await Promise.all([api.publicPostHeads(), api.publicTrips()]);
      posts = heads;
      trips = loadedTrips;
    } finally {
      loading = false;
    }
  });
</script>

<SiteHeader current="archiv" />

<main class="wrap">
  <div class="arch-intro">
    <p class="eyebrow">Archiv</p>
    <h1 class="h-page">Alle Beiträge</h1>
    {#if !loading && posts.length > 0}
      <div class="controls">
        <div class="modes" role="group" aria-label="Gruppierung">
          {#each MODES as m (m.value)}
            <button
              type="button"
              class="mode"
              class:active={archiveState.mode === m.value}
              aria-pressed={archiveState.mode === m.value}
              onclick={() => archiveState.setMode(m.value)}
            >
              {m.label}
            </button>
          {/each}
        </div>
        <div class="bulk">
          <button
            type="button"
            class="btn"
            disabled={openCount === allKeys.length}
            onclick={() => archiveState.expandAll(archiveState.mode, allKeys)}
          >
            Alle ausklappen
          </button>
          <button
            type="button"
            class="btn"
            disabled={openCount === 0}
            onclick={() => archiveState.collapseAll(archiveState.mode)}
          >
            Alle einklappen
          </button>
        </div>
      </div>
    {/if}
  </div>

  {#if loading}
    <p class="status">Lädt…</p>
  {:else if groups.length === 0}
    <p class="status">Noch keine Beiträge.</p>
  {:else}
    <div class="accordion">
      {#each groups as group (group.key)}
        {@const open = isOpen(group.key)}
        <section class="group" class:open>
          <h2 class="group-head">
            <button
              type="button"
              aria-expanded={open}
              onclick={() => archiveState.toggle(archiveState.mode, group.key)}
            >
              <span class="label">{group.label}</span>
              <span class="count">{count(group)}</span>
              <svg
                class="chev"
                class:open
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>
          </h2>
          {#if open}
            <div class="group-body">
              {#each group.posts as post (post.id)}
                <a class="arch-row" href={`#/beitrag/${post.id}`}>
                  <span class="thumb"><Photo src={thumb(post)} ratio="r43" size="sm" /></span>
                  <span class="t">
                    <h3>{post.title}</h3>
                    <div class="where">{post.placeName}, {countryName(post.country)}</div>
                  </span>
                  <span class="d">{formatDate(post.postDate)}</span>
                  <span class="go" aria-hidden="true">→</span>
                </a>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</main>

<SiteFooter />

<style>
  .arch-intro {
    padding: 48px 0 8px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 22px;
  }
  .bulk {
    display: inline-flex;
    gap: 10px;
  }
  .bulk .btn:disabled {
    opacity: 0.45;
    cursor: default;
    border-color: var(--line);
  }
  .modes {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 9px;
    overflow: hidden;
    background: var(--surface);
  }
  .mode {
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-right: 1px solid var(--line);
    padding: 9px 18px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .mode:last-child {
    border-right: 0;
  }
  .mode:hover {
    color: var(--accent);
  }
  .mode.active {
    background: var(--accent);
    color: #fff;
  }
  .status {
    padding: 24px 0 60px;
    color: var(--muted);
  }
  .accordion {
    margin-top: 36px;
  }
  /* The header's 2px --ink bottom border is the row divider between groups. */
  .group-head {
    margin: 0;
  }
  .group-head button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    font: inherit;
    background: transparent;
    border: 0;
    border-bottom: 2px solid var(--ink);
    padding: 18px 4px;
    cursor: pointer;
    text-align: left;
  }
  .group-head .label {
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: var(--ink);
    transition: color 0.15s;
  }
  .group-head button:hover .label,
  .group.open .group-head .label {
    color: var(--accent);
  }
  .group-head .count {
    font-size: 13px;
    font-weight: 500;
    color: var(--faint);
  }
  .group-head .chev {
    margin-left: auto;
    color: var(--ink);
    /* Closed points right; open points down. */
    transform: rotate(-90deg);
    transition: transform 0.2s ease;
  }
  .group-head .chev.open {
    transform: rotate(0deg);
  }
  .group-body {
    padding-bottom: 14px;
  }
  .arch-row {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 14px 12px 14px 0;
    border-top: 1px solid var(--line-soft);
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
  .arch-row .t h3 {
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
  @media (max-width: 600px) {
    .arch-row {
      gap: 14px;
    }
    .arch-row .thumb {
      width: 78px;
    }
    .arch-row .go {
      display: none;
    }
  }
</style>
