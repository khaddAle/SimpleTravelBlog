<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto, TripDto } from '@stb/shared';
  import { api, type PublicSearchQuery } from '../lib/api.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import PostCard from '../components/PostCard.svelte';

  const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const fmtYm = (v: number): string => `${MONTHS[(v % 100) - 1]} ${Math.floor(v / 100)}`;

  let q = $state('');
  let country = $state('');
  let tripId = $state('');
  let von = $state<number | undefined>(undefined);
  let bis = $state<number | undefined>(undefined);

  let trips = $state<TripDto[]>([]);
  let countries = $state<string[]>([]);
  let months = $state<number[]>([]);
  let results = $state<PostDto[]>([]);
  let count = $state(0);
  let ready = $state(false);
  let searched = $state(false);

  onMount(async () => {
    // Filter options come from a dedicated facets endpoint, not a page of posts,
    // so Land/Monat stay complete no matter how many posts exist.
    const [facets, loadedTrips] = await Promise.all([api.publicFacets(), api.publicTrips()]);
    trips = loadedTrips;
    countries = [...facets.countries].sort((a, b) =>
      countryName(a).localeCompare(countryName(b), 'de'),
    );
    months = [...facets.months].sort((a, b) => a - b);
    von = months[0];
    bis = months.at(-1);
    ready = true;
  });

  function monthStart(v: number): string {
    return new Date(Date.UTC(Math.floor(v / 100), (v % 100) - 1, 1)).toISOString();
  }
  function monthEnd(v: number): string {
    return new Date(Date.UTC(Math.floor(v / 100), v % 100, 1) - 1).toISOString();
  }

  function buildQuery(): PublicSearchQuery {
    const query: PublicSearchQuery = {};
    if (q.trim()) query.q = q.trim();
    if (country) query.country = country;
    if (tripId) query.tripId = tripId;
    let lo = von;
    let hi = bis;
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    if (lo !== undefined) query.from = monthStart(lo);
    if (hi !== undefined) query.to = monthEnd(hi);
    return query;
  }

  // Guards against out-of-order responses: only the newest search wins.
  let seq = 0;
  async function runSearch(): Promise<void> {
    const mine = ++seq;
    const out = await api.publicSearch(buildQuery());
    if (mine !== seq) return;
    results = out;
    count = out.length;
    searched = true;
  }

  // Live filtering: re-run (debounced) whenever a filter changes, once the
  // option lists are loaded so the month range is in place.
  $effect(() => {
    void [q, country, tripId, von, bis, ready];
    if (!ready) return;
    const handle = setTimeout(runSearch, 200);
    return () => clearTimeout(handle);
  });

  function reset(): void {
    q = '';
    country = '';
    tripId = '';
    von = months[0];
    bis = months.at(-1);
  }
</script>

<SiteHeader current="suche" />

<main class="wrap">
  <div class="search-intro">
    <p class="eyebrow">Suche</p>
    <h1 class="h-page">Beiträge filtern</h1>
  </div>

  <div class="filters">
    <div class="field search">
      <label for="q">Text</label>
      <input id="q" type="search" placeholder="Titel oder Ort suchen …" autocomplete="off" bind:value={q} />
    </div>
    <div class="field">
      <label for="land">Land</label>
      <select id="land" bind:value={country}>
        <option value="">Alle Länder</option>
        {#each countries as code (code)}
          <option value={code}>{countryName(code)}</option>
        {/each}
      </select>
    </div>
    <div class="field">
      <label for="reise">Reise</label>
      <select id="reise" bind:value={tripId}>
        <option value="">Alle Reisen</option>
        {#each trips as trip (trip.id)}
          <option value={trip.id}>{trip.name}</option>
        {/each}
      </select>
    </div>
    <div class="row2">
      <div class="field">
        <label for="von">Von</label>
        <select id="von" bind:value={von}>
          {#each months as m (m)}<option value={m}>{fmtYm(m)}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="bis">Bis</label>
        <select id="bis" bind:value={bis}>
          {#each months as m (m)}<option value={m}>{fmtYm(m)}</option>{/each}
        </select>
      </div>
      <button class="reset" type="button" onclick={reset}>Zurücksetzen</button>
    </div>
  </div>

  {#if ready}
    <div class="result-bar">
      <span class="count">{count} {count === 1 ? 'Beitrag' : 'Beiträge'}</span>
      <span class="meta">Neueste zuerst</span>
    </div>
  {/if}

  {#if results.length > 0}
    <div class="post-grid">
      {#each results as post (post.id)}
        <PostCard {post} />
      {/each}
    </div>
  {:else if searched}
    <div class="empty">
      <div class="big">Keine Beiträge gefunden</div>
      <div>Versuche andere Filter oder setze die Suche zurück.</div>
    </div>
  {/if}
</main>

<SiteFooter />

<style>
  .search-intro {
    padding: 48px 0 26px;
  }
  .filters {
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-frame-sm);
    padding: 14px;
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 12px;
    align-items: end;
  }
  .filters .row2 {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 12px;
    align-items: end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    padding-left: 2px;
  }
  .field input,
  .field select {
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 11px 12px;
    appearance: none;
    border-radius: 0;
  }
  .field input::placeholder {
    color: var(--faint);
  }
  .field input:focus,
  .field select:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
  }
  .reset {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    padding: 11px 14px;
    cursor: pointer;
    align-self: end;
  }
  .reset:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .result-bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 30px 0 26px;
  }
  .result-bar .count {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }
  .empty {
    text-align: center;
    padding: 70px 0;
    color: var(--faint);
  }
  .empty .big {
    font-size: 19px;
    color: var(--muted);
    font-weight: 500;
    margin-bottom: 6px;
  }
  @media (max-width: 820px) {
    .filters {
      grid-template-columns: 1fr;
    }
    .filters .row2 {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
