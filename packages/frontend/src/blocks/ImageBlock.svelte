<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import Photo from '../components/Photo.svelte';
  import Lightbox from './Lightbox.svelte';

  /**
   * A single framed image. The first image of a post is the `lead` — it bleeds
   * wider than the reading column as a 16:9 print; every other image sits in
   * the column at 4:3. Clicking opens the full image in the lightbox.
   */
  let { block, lead = false }: { block: Extract<Block, { type: 'image' }>; lead?: boolean } =
    $props();

  let open = $state(false);
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
</style>
