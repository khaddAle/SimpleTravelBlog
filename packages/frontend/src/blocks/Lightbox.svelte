<script lang="ts">
  import { untrack } from 'svelte';
  import { imageUrl } from '../lib/images.js';

  interface Props {
    imageIds: string[];
    index?: number;
    caption?: string | undefined;
    onClose: () => void;
  }

  let { imageIds, index = 0, caption, onClose }: Props = $props();

  // Seed the viewer position once from the initial index; navigation owns it after.
  let current = $state(untrack(() => index));
  const count = $derived(imageIds.length);
  let closeBtn = $state<HTMLButtonElement>();

  function next(): void {
    current = (current + 1) % count;
  }
  function prev(): void {
    current = (current - 1 + count) % count;
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowRight') next();
    else if (event.key === 'ArrowLeft') prev();
  }

  // Listen globally for keyboard control and lock background scroll while open;
  // both are torn down when the overlay unmounts.
  $effect(() => {
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  });

  // Move focus into the dialog so keyboard users land on a control.
  $effect(() => {
    closeBtn?.focus();
  });
</script>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="Galerie">
  <button
    class="close"
    type="button"
    aria-label="Schließen"
    bind:this={closeBtn}
    onclick={onClose}>✕</button
  >
  {#if count > 1}
    <button class="nav prev" type="button" aria-label="Vorheriges Bild" onclick={prev}>‹</button>
  {/if}
  <figure>
    <img src={imageUrl(imageIds[current]!, 'display')} alt="" />
    {#if caption}
      <figcaption>{caption}</figcaption>
    {/if}
  </figure>
  {#if count > 1}
    <button class="nav next" type="button" aria-label="Nächstes Bild" onclick={next}>›</button>
  {/if}
</div>

<style>
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 3000;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  figure {
    margin: 0;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  figure img {
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
  }
  figcaption {
    margin-top: 0.5rem;
    color: #e2e8f0;
    font-size: 0.9rem;
    text-align: center;
  }
  .close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: 1.5rem;
  }
  .nav {
    font-size: 2.5rem;
    line-height: 1;
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: 0 0.5rem;
  }
  .close {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
  }
</style>
