<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'paragraph' }> } = $props();
</script>

<p class="block block-paragraph">{block.text}</p>

<style>
  .block-paragraph {
    margin: 0.75rem 0;
    line-height: 1.7;
    white-space: pre-wrap;
  }
</style>
