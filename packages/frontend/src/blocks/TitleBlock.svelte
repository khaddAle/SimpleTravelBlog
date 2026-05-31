<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'title' }> } = $props();
</script>

<div class="wrap-narrow">
  <h2 class="block-title">{block.text}</h2>
</div>

<style>
  .block-title {
    font-size: clamp(24px, 4vw, 32px);
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.8px;
    color: var(--ink);
    margin: 56px 0 0;
    text-wrap: balance;
  }
</style>
