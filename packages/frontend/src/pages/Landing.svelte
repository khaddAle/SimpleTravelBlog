<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublicPostHead } from '@stb/shared';
  import { api } from '../lib/api.js';
  import { imageUrl } from '../lib/images.js';
  import { formatDate } from '../lib/dates.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';
  import PostCard from '../components/PostCard.svelte';
  import Photo from '../components/Photo.svelte';

  let posts = $state<PublicPostHead[]>([]);
  let loading = $state(true);
  let error = $state(false);

  // Newest post becomes the hero teaser; the rest fill the grid below.
  const hero = $derived(posts[0]);
  const rest = $derived(posts.slice(1));
  // Heads carry only an explicit cover (no blocks to fall back on in list views).
  const heroCover = $derived(hero?.coverImageId);

  onMount(async () => {
    try {
      posts = await api.publicPostHeads(12);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });
</script>

<SiteHeader current="beitraege" />

<main class="wrap">
  {#if loading}
    <p class="status">Lädt…</p>
  {:else if error}
    <p class="status" role="alert">Beiträge konnten nicht geladen werden.</p>
  {:else if !hero}
    <p class="status">Noch keine Beiträge.</p>
  {:else}
    <section class="hero">
      <div>
        <p class="eyebrow">Neuester Beitrag</p>
        <h1 class="h-display">{hero.title}</h1>
        {#if hero.subtitle}
          <p class="lede stack-24 hero-lede">{hero.subtitle}</p>
        {/if}
        <p class="meta stack-32">
          <b>{hero.placeName}, {countryName(hero.country)}</b> &nbsp; {formatDate(hero.postDate)}
        </p>
        <a class="link-arrow hero-cta" href={`#/beitrag/${hero.id}`}>
          Weiterlesen <span class="arr">→</span>
        </a>
      </div>
      <a class="hero-photo" href={`#/beitrag/${hero.id}`} aria-label={hero.title}>
        <Photo src={heroCover ? imageUrl(heroCover, 'display') : undefined} ratio="r54" />
      </a>
    </section>

    {#if rest.length > 0}
      <section class="more">
        <div class="section-head">
          <h2 class="h-2">Weitere Reisen</h2>
          <a class="link-accent" href="#/archiv">Alle Beiträge →</a>
        </div>
        <div class="post-grid">
          {#each rest as post (post.id)}
            <PostCard {post} />
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</main>

<SiteFooter />

<style>
  .hero {
    display: grid;
    grid-template-columns: 1fr 1.08fr;
    gap: 70px;
    align-items: center;
    padding: 60px 0 30px;
  }
  .hero-photo {
    display: block;
  }
  .hero-lede {
    max-width: 34ch;
  }
  .hero-cta {
    margin-top: 34px;
  }
  .more {
    margin-top: 70px;
  }
  .status {
    padding: 60px 0;
    color: var(--muted);
  }
  @media (max-width: 860px) {
    .hero {
      grid-template-columns: 1fr;
      gap: 30px;
      padding: 40px 0 20px;
    }
  }
</style>
