<script lang="ts">
  import type { Block } from '@stb/shared';
  import type { Dim } from '../lib/masonry.js';
  import TitleBlock from './TitleBlock.svelte';
  import SubtitleBlock from './SubtitleBlock.svelte';
  import ParagraphBlock from './ParagraphBlock.svelte';
  import ImageBlock from './ImageBlock.svelte';
  import GalleryBlock from './GalleryBlock.svelte';
  import QuoteBlock from './QuoteBlock.svelte';
  import DividerBlock from './DividerBlock.svelte';

  // `lead` marks the post's first image so it renders as the wide bleed header.
  // `images` is the §0 dimension sidecar, threaded to the image/gallery blocks
  // for orientation-aware / masonry rendering.
  let {
    block,
    lead = false,
    images,
  }: { block: Block; lead?: boolean; images?: Record<string, Dim> | undefined } = $props();
</script>

{#if block.type === 'title'}
  <TitleBlock {block} />
{:else if block.type === 'subtitle'}
  <SubtitleBlock {block} />
{:else if block.type === 'paragraph'}
  <ParagraphBlock {block} />
{:else if block.type === 'image'}
  <ImageBlock {block} {lead} {images} />
{:else if block.type === 'gallery'}
  <GalleryBlock {block} {images} />
{:else if block.type === 'quote'}
  <QuoteBlock {block} />
{:else if block.type === 'divider'}
  <DividerBlock />
{/if}
