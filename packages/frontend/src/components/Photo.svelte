<script lang="ts">
  /**
   * The signature framed-print primitive: a white mat with an inner keyline and
   * a fixed-aspect window. `.frame` is `display:block` so `aspect-ratio` applies
   * and the image fills it. Callers wrap this in an `<a>` when the photo links;
   * pass a `caption` to render it as a `<figure>` with a `<figcaption>`.
   */
  type Ratio = 'r54' | 'r43' | 'r169' | 'r11';

  let {
    src,
    alt = '',
    ratio,
    size = 'lead',
    caption,
  }: {
    src?: string | undefined;
    alt?: string;
    ratio: Ratio;
    size?: 'lead' | 'sm';
    caption?: string;
  } = $props();
</script>

{#snippet mat()}
  <span class="photo" class:sm={size === 'sm'}>
    <span class="frame {ratio}">
      {#if src}<img {src} {alt} />{/if}
    </span>
  </span>
{/snippet}

{#if caption}
  <figure>
    {@render mat()}
    <figcaption>{caption}</figcaption>
  </figure>
{:else}
  {@render mat()}
{/if}
