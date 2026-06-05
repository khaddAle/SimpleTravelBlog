<script lang="ts">
  import { onMount } from 'svelte';
  import type { Block } from '@stb/shared';
  import { imageUrl } from '../lib/images.js';
  import { packMasonry, type Dim } from '../lib/masonry.js';
  import Lightbox from './Lightbox.svelte';

  /**
   * Gallery as an order-preserving shortest-column masonry: each tile keeps its
   * natural ratio (no crop), columns stay height-balanced, and reading order is
   * preserved down each column. Column count is reactive by breakpoint
   * (3 / 2 ≤720px / 1 ≤440px). Tiles carry their **original** gallery index, so
   * the Lightbox (grouped by gallery) still opens at the clicked image.
   */
  let {
    block,
    images,
  }: {
    block: Extract<Block, { type: 'gallery' }>;
    images?: Record<string, Dim> | undefined;
  } = $props();

  let openIndex = $state<number | null>(null);
  let columns = $state(3);

  // Default to a square for images without a sidecar entry — still placed, never
  // cropped (a 1:1 frame is a no-crop fill for whatever the image's true ratio).
  const dims = $derived<Dim[]>(block.imageIds.map((id) => images?.[id] ?? { width: 1, height: 1 }));
  const cols = $derived(packMasonry(dims, columns));

  onMount(() => {
    if (typeof window.matchMedia !== 'function') return;
    const q2 = window.matchMedia('(max-width: 720px)');
    const q1 = window.matchMedia('(max-width: 440px)');
    const update = (): void => {
      columns = q1.matches ? 1 : q2.matches ? 2 : 3;
    };
    update();
    q2.addEventListener('change', update);
    q1.addEventListener('change', update);
    return () => {
      q2.removeEventListener('change', update);
      q1.removeEventListener('change', update);
    };
  });
</script>

<figure class="bleed block">
  <div class="masonry">
    {#each cols as col, ci (ci)}
      <div class="mcol">
        {#each col as i (block.imageIds[i])}
          <button
            type="button"
            class="lb-trigger"
            aria-label="Bild öffnen"
            onclick={() => (openIndex = i)}
          >
            <span class="photo sm">
              <span class="frame" style={`aspect-ratio: ${dims[i]!.width}/${dims[i]!.height}`}>
                <img src={imageUrl(block.imageIds[i]!, 'thumb')} alt="" />
              </span>
            </span>
          </button>
        {/each}
      </div>
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
  .masonry {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  .mcol {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .lb-trigger {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: zoom-in;
  }
  .mcol .frame img {
    height: auto;
  }
</style>
