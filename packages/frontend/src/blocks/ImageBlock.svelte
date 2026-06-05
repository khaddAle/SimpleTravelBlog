<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import { isPortrait, type Dim } from '../lib/masonry.js';
  import Photo from '../components/Photo.svelte';
  import Lightbox from './Lightbox.svelte';

  /**
   * A single framed image. The first image of a post is the `lead` — it bleeds
   * wider than the reading column as a 16:9 print. A body image renders at 4:3
   * when landscape, but a **portrait** image (from the §0 dimension sidecar) is
   * shown narrow + centered at its **natural** ratio so it is never cropped —
   * reusing `Photo`'s global `.photo`/`.frame` classes via plain markup (the
   * frame's matching `aspect-ratio` makes `object-fit:cover` a no-crop fill).
   * Clicking opens the full image in the lightbox.
   */
  let {
    block,
    lead = false,
    images,
  }: {
    block: Extract<Block, { type: 'image' }>;
    lead?: boolean;
    images?: Record<string, Dim> | undefined;
  } = $props();

  let open = $state(false);
  const dim = $derived(images?.[block.imageId]);
  const portrait = $derived(!lead && isPortrait(dim));
  const ratioStyle = $derived(dim ? `aspect-ratio: ${dim.width}/${dim.height}` : '');
</script>

{#snippet trigger(ratio: 'r169' | 'r43')}
  <button type="button" class="lb-trigger" aria-label="Bild öffnen" onclick={() => (open = true)}>
    <Photo src={imageUrl(block.imageId, 'display')} alt={block.caption ?? ''} {ratio} />
  </button>
{/snippet}

{#if lead}
  <figure class="bleed block">
    {@render trigger('r169')}
    {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
  </figure>
{:else if portrait}
  <div class="wrap-narrow">
    <figure class="block portrait">
      <button
        type="button"
        class="lb-trigger"
        aria-label="Bild öffnen"
        onclick={() => (open = true)}
      >
        <span class="photo">
          <span class="frame" style={ratioStyle}>
            <img src={imageUrl(block.imageId, 'display')} alt={block.caption ?? ''} />
          </span>
        </span>
      </button>
      {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
    </figure>
  </div>
{:else}
  <div class="wrap-narrow">
    <figure class="block">
      {@render trigger('r43')}
      {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
    </figure>
  </div>
{/if}

{#if open}
  <Lightbox imageIds={[block.imageId]} caption={block.caption} onClose={() => (open = false)} />
{/if}

<style>
  .lb-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: zoom-in;
  }
  /* Portrait single image: a narrow, centered figure at natural ratio. */
  .portrait {
    max-width: 380px;
    margin: 0 auto;
  }
  .portrait .frame img {
    height: auto;
  }
</style>
