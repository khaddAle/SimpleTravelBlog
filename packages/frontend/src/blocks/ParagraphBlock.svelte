<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'paragraph' }> } = $props();
</script>

<div class="wrap-narrow">
  <div class="prose"><p>{block.text}</p></div>
</div>

<style>
  /* Preserve author line breaks within a paragraph block. */
  p {
    white-space: pre-wrap;
  }
</style>
