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
      // Ten posts total: one hero teaser + a clean 3×3 grid of the rest.
      posts = await api.publicPostHeads(10);
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
      <p class="eyebrow center">Neuester Beitrag</p>
      <h1 class="h-display">{hero.title}</h1>
      {#if hero.subtitle}
        <p class="lede stack-24 hero-lede">{hero.subtitle}</p>
      {/if}
      <p class="meta stack-24">
        <b>{hero.placeName}, {countryName(hero.country)}</b><span class="sep">·</span
        >{formatDate(hero.postDate)}
      </p>
      <a class="btn primary hero-cta" href={`#/beitrag/${hero.id}`}>
        Weiterlesen <span class="arr">→</span>
      </a>
      <a class="hero-photo" href={`#/beitrag/${hero.id}`} aria-label={hero.title}>
        <Photo src={heroCover ? imageUrl(heroCover, 'display') : undefined} ratio="r169" />
      </a>
    </section>

    {#if rest.length > 0}
      <section class="more">
        <div class="section-head">
          <h2 class="h-2">Weitere Reisen</h2>
        </div>
        <div class="post-grid">
          {#each rest as post (post.id)}
            <PostCard {post} />
          {/each}
        </div>
        <div class="more-foot">
          <a class="btn" href="#/archiv">Alle Reisen im Archiv <span class="arr">→</span></a>
        </div>
      </section>
    {/if}
  {/if}
</main>

<SiteFooter />

<style>
  /* A single centered editorial column: eyebrow → title → lede → meta → CTA,
     then a wide 16:9 print beneath. */
  .hero {
    text-align: center;
    padding: 60px 0 30px;
  }
  .hero-lede {
    max-width: 40ch;
    margin: 18px auto 0;
  }
  .hero-cta {
    margin-top: 28px;
  }
  .hero-photo {
    display: block;
    max-width: 940px;
    margin: 28px auto 0;
  }
  .more {
    margin-top: 70px;
  }
  /* The grid's single archive affordance, centered below it. */
  .more-foot {
    display: flex;
    justify-content: center;
    margin-top: 44px;
  }
  .more-foot .arr {
    color: var(--accent);
  }
  .status {
    padding: 60px 0;
    color: var(--muted);
  }
  @media (max-width: 860px) {
    .hero {
      padding: 40px 0 20px;
    }
  }
</style>
