<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'subtitle' }> } = $props();
</script>

<h3 class="block block-subtitle">{block.text}</h3>

<style>
  .block-subtitle {
    margin: 1rem 0 0.25rem;
    font-size: 1.3rem;
    font-weight: 600;
    color: #4a5568;
  }
</style>
