<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  let { block }: { block: Extract<Block, { type: 'gallery' }> } = $props();
</script>

<figure class="block block-gallery">
  <div class="gallery-grid">
    {#each block.imageIds as id (id)}
      <a href={imageUrl(id, 'display')} target="_blank" rel="noopener">
        <img src={imageUrl(id, 'thumb')} alt="" loading="lazy" />
      </a>
    {/each}
  </div>
  {#if block.caption}
    <figcaption>{block.caption}</figcaption>
  {/if}
</figure>

<style>
  .block-gallery {
    margin: 1.25rem 0;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 0.5rem;
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
