<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import Lightbox from './Lightbox.svelte';
  let { block }: { block: Extract<Block, { type: 'gallery' }> } = $props();

  let openIndex = $state<number | null>(null);
</script>

<figure class="block block-gallery">
  <div class="gallery-grid">
    {#each block.imageIds as id, i (id)}
      <button type="button" class="gallery-item" aria-label="Bild öffnen" onclick={() => (openIndex = i)}>
        <img src={imageUrl(id, 'thumb')} alt="" loading="lazy" />
      </button>
    {/each}
  </div>
  {#if block.caption}
    <figcaption>{block.caption}</figcaption>
  {/if}
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
  .block-gallery {
    margin: 1.25rem 0;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.5rem;
  }
  .gallery-item {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    display: block;
  }
  .gallery-grid img {
    width: 100%;
    height: 120px;
    object-fit: cover;
    border-radius: 4px;
  }
  figcaption {
    margin-top: 0.4rem;
    font-size: 0.9rem;
    color: #718096;
    text-align: center;
  }
</style>
