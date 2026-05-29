<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'title' }> } = $props();
</script>

<h2 class="block block-title">{block.text}</h2>

<style>
  .block-title {
    margin: 1.5rem 0 0.5rem;
    font-size: 1.8rem;
    line-height: 1.2;
  }
</style>
