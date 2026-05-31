<script lang="ts">
  import type { Block } from '@stb/shared';
  import TitleBlock from './TitleBlock.svelte';
  import SubtitleBlock from './SubtitleBlock.svelte';
  import ParagraphBlock from './ParagraphBlock.svelte';
  import ImageBlock from './ImageBlock.svelte';
  import GalleryBlock from './GalleryBlock.svelte';
  import QuoteBlock from './QuoteBlock.svelte';
  import DividerBlock from './DividerBlock.svelte';

  // `lead` marks the post's first image so it renders as the wide bleed header.
  let { block, lead = false }: { block: Block; lead?: boolean } = $props();
</script>

{#if block.type === 'title'}
  <TitleBlock {block} />
{:else if block.type === 'subtitle'}
  <SubtitleBlock {block} />
{:else if block.type === 'paragraph'}
  <ParagraphBlock {block} />
{:else if block.type === 'image'}
  <ImageBlock {block} {lead} />
{:else if block.type === 'gallery'}
  <GalleryBlock {block} />
{:else if block.type === 'quote'}
  <QuoteBlock {block} />
{:else if block.type === 'divider'}
  <DividerBlock />
{/if}
