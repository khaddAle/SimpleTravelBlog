<script lang="ts">
  import type { Block } from '@stb/shared';
  let { block }: { block: Extract<Block, { type: 'quote' }> } = $props();
</script>

<blockquote class="block block-quote">
  <p>{block.text}</p>
  {#if block.source}
    <cite>— {block.source}</cite>
  {/if}
</blockquote>

<style>
  .block-quote {
    margin: 1.25rem 0;
    padding: 0.5rem 1rem;
    border-left: 4px solid var(--accent);
    font-style: italic;
    color: #2d3748;
  }
  cite {
    display: block;
    margin-top: 0.4rem;
    font-size: 0.9rem;
    font-style: normal;
    color: #718096;
  }
</style>
