<script lang="ts">
  import { onMount } from 'svelte';
  import type { PostDto } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { settings } from '../lib/settings.svelte.js';
  import PostCard from '../components/PostCard.svelte';

  let posts = $state<PostDto[]>([]);
  let loading = $state(true);
  let error = $state(false);

  onMount(async () => {
    try {
      posts = (await api.publicPosts(1, 12)).items;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });
</script>

<section class="landing">
  <header class="hero">
    <h1>{settings.siteTitle}</h1>
    <nav>
      <a href="#/archiv">Alle Beiträge</a>
      <a href="#/karte">Karte</a>
      <a href="#/suche">Suche</a>
    </nav>
  </header>

  {#if loading}
    <p>Lädt…</p>
  {:else if error}
    <p role="alert">Beiträge konnten nicht geladen werden.</p>
  {:else if posts.length === 0}
    <p>Noch keine Beiträge.</p>
  {:else}
    <div class="grid">
      {#each posts as post (post.id)}
        <PostCard {post} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .hero {
    text-align: center;
    margin: 2rem 0;
  }
  .hero nav {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1rem;
  }
</style>
