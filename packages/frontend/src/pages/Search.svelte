<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto, TripDto } from '@stb/shared';
  import { api, type PublicSearchQuery } from '../lib/api.js';
  import { fromDateInputValue } from '../lib/dates.js';
  import PostCard from '../components/PostCard.svelte';

  let q = $state('');
  let country = $state('');
  let tripId = $state('');
  let from = $state('');
  let to = $state('');

  let trips = $state<TripDto[]>([]);
  let results = $state<PostDto[]>([]);
  let searched = $state(false);
  let loading = $state(false);

  onMount(async () => {
    trips = await api.publicTrips();
  });

  async function run(event: Event): Promise<void> {
    event.preventDefault();
    loading = true;
    const query: PublicSearchQuery = {};
    if (q.trim()) query.q = q.trim();
    if (country.trim()) query.country = country.trim().toUpperCase();
    if (tripId) query.tripId = tripId;
    if (from) query.from = fromDateInputValue(from);
    if (to) query.to = fromDateInputValue(to);
    try {
      results = await api.publicSearch(query);
    } finally {
      loading = false;
      searched = true;
    }
  }
</script>

<section class="search">
  <h1>Suche</h1>
  <form onsubmit={run}>
    <input type="search" aria-label="Suchbegriff" placeholder="Suchbegriff" bind:value={q} />
    <input type="text" aria-label="Land" placeholder="Land (z. B. DE)" maxlength="2" bind:value={country} />
    <select aria-label="Reise" bind:value={tripId}>
      <option value="">Alle Reisen</option>
      {#each trips as trip (trip.id)}
        <option value={trip.id}>{trip.name}</option>
      {/each}
    </select>
    <input type="date" aria-label="Von" bind:value={from} />
    <input type="date" aria-label="Bis" bind:value={to} />
    <button type="submit" disabled={loading}>Suchen</button>
  </form>

  {#if loading}
    <p>Sucht…</p>
  {:else if searched && results.length === 0}
    <p>Keine Treffer.</p>
  {:else if results.length > 0}
    <div class="grid">
      {#each results as post (post.id)}
        <PostCard {post} />
      {/each}
    </div>
  {/if}
</section>

<style>
  form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
</style>
