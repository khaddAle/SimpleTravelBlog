<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import Lightbox from './Lightbox.svelte';
  let { block }: { block: Extract<Block, { type: 'image' }> } = $props();

  let open = $state(false);
</script>

<figure class="block block-image">
  <button type="button" class="image-trigger" aria-label="Bild öffnen" onclick={() => (open = true)}>
    <img src={imageUrl(block.imageId, 'display')} alt={block.caption ?? ''} loading="lazy" />
  </button>
  {#if block.caption}
    <figcaption>{block.caption}</figcaption>
  {/if}
</figure>

{#if open}
  <Lightbox imageIds={[block.imageId]} caption={block.caption} onClose={() => (open = false)} />
{/if}

<style>
  .block-image {
    margin: 1.25rem 0;
  }
  .image-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
  }
  .block-image img {
    width: 100%;
    height: auto;
    border-radius: 6px;
  }
  figcaption {
    margin-top: 0.4rem;
    font-size: 0.9rem;
    color: #718096;
    text-align: center;
  }
</style>
