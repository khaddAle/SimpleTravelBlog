<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import Photo from '../components/Photo.svelte';
  import Lightbox from './Lightbox.svelte';

  let { block }: { block: Extract<Block, { type: 'gallery' }> } = $props();

  let openIndex = $state<number | null>(null);
</script>

<figure class="bleed block">
  <div class="gallery">
    {#each block.imageIds as id, i (id)}
      <button
        type="button"
        class="lb-trigger"
        aria-label="Bild öffnen"
        onclick={() => (openIndex = i)}
      >
        <Photo src={imageUrl(id, 'thumb')} ratio="r43" size="sm" />
      </button>
    {/each}
  </div>
  {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
</figure>

{#if openIndex !== null}
  <Lightbox
    imageIds={block.imageIds}
    index={openIndex}
    caption={block.caption}
    onClose={() => (openIndex = null)}
  />
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
