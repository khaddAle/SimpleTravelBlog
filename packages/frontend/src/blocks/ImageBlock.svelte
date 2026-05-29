<script lang="ts">
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  let { block }: { block: Extract<Block, { type: 'image' }> } = $props();
</script>

<figure class="block block-image">
  <img src={imageUrl(block.imageId, 'display')} alt={block.caption ?? ''} loading="lazy" />
  {#if block.caption}
    <figcaption>{block.caption}</figcaption>
  {/if}
</figure>

<style>
  .block-image {
    margin: 1.25rem 0;
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
