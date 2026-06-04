<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublicPostHead, TripDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { groupBy, type GroupMode, type ArchiveGroup } from '../lib/archive.js';
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
  let mode = $state<GroupMode>('reise');
  let openKey = $state<string | null>(null);

  // All heads are pulled once; switching mode is a pure client-side regroup.
  const groups = $derived(groupBy(mode, posts, trips));

  // Keep exactly one group open: when the grouping changes (mode switch or load)
  // and the open key no longer exists, fall back to the top group.
  $effect(() => {
    if (!groups.some((g) => g.key === openKey)) {
      openKey = groups[0]?.key ?? null;
    }
  });

  function toggle(key: string): void {
    openKey = openKey === key ? null : key;
  }

  function thumb(post: PublicPostHead): string | undefined {
    return post.coverImageId ? imageUrl(post.coverImageId, 'thumb') : undefined;
  }

  function count(group: ArchiveGroup): string {
    const n = group.posts.length;
    return `${n} ${n === 1 ? 'Beitrag' : 'Beiträge'}`;
  }

  onMount(async () => {
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
      <div class="modes" role="group" aria-label="Gruppierung">
        {#each MODES as m (m.value)}
          <button
            type="button"
            class="mode"
            class:active={mode === m.value}
            aria-pressed={mode === m.value}
            onclick={() => (mode = m.value)}
          >
            {m.label}
          </button>
        {/each}
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
        {@const open = openKey === group.key}
        <section class="group" class:open>
          <h2 class="group-head">
            <button type="button" aria-expanded={open} onclick={() => toggle(group.key)}>
              <span class="label">{group.label}</span>
              <span class="count">{count(group)}</span>
              <span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
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
  .modes {
    display: inline-flex;
    margin-top: 22px;
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
    border-top: 1px solid var(--line);
  }
  .group {
    border-bottom: 1px solid var(--line);
  }
  .group-head {
    margin: 0;
  }
  .group-head button {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 14px;
    font: inherit;
    background: transparent;
    border: 0;
    padding: 20px 4px;
    cursor: pointer;
    text-align: left;
  }
  .group-head .label {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.6px;
    color: var(--ink);
  }
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
    font-size: 14px;
    color: var(--faint);
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
    .group-head .label {
      font-size: 22px;
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
  }
</style>
