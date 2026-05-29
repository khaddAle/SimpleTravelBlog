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
</style>
