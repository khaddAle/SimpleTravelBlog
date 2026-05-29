<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto, TripDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { groupPosts, type CountryGroup } from '../lib/archive.js';
  import PostCard from '../components/PostCard.svelte';

  let groups = $state<CountryGroup[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      const [page, trips] = await Promise.all([api.publicPosts(1, 100), api.publicTrips()]);
      groups = groupPosts(page.items as PostDto[], trips as TripDto[]);
    } finally {
      loading = false;
    }
  });
</script>

<section class="archive">
  <h1>Alle Beiträge</h1>

  {#if loading}
    <p>Lädt…</p>
  {:else if groups.length === 0}
    <p>Noch keine Beiträge.</p>
  {:else}
    {#each groups as group (group.country)}
      <section class="country">
        <h2>{group.country}</h2>
        {#each group.trips as trip (trip.tripId ?? '_none')}
          <div class="trip">
            <h3>{trip.tripName ?? 'Einzelne Beiträge'}</h3>
            <div class="grid">
              {#each trip.posts as post (post.id)}
                <PostCard {post} />
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/each}
  {/if}
</section>

<style>
  .country {
    margin-bottom: 2rem;
  }
  .trip {
    margin: 1rem 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
</style>
