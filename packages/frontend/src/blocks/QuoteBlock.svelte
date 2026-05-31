<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'quote' }> } = $props();
</script>

<div class="wrap-narrow">
  <blockquote class="pullquote">
    <p>„{block.text}“</p>
    {#if block.source}
      <cite>{block.source}</cite>
    {/if}
  </blockquote>
</div>
