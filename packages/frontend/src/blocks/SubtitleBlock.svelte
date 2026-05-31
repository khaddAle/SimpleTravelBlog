<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'subtitle' }> } = $props();
</script>

<div class="wrap-narrow">
  <h3 class="block-subtitle">{block.text}</h3>
</div>

<style>
  .block-subtitle {
    font-size: 21px;
    line-height: 1.4;
    font-weight: 600;
    letter-spacing: -0.3px;
    color: var(--muted);
    margin: 40px 0 0;
  }
</style>
