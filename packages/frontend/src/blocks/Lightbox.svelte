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
  const multi = $derived(count > 1);
  let closeBtn = $state<HTMLButtonElement>();
  let overlayEl = $state<HTMLDivElement>();
  let stageEl = $state<HTMLDivElement>();

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

  // Backdrop click closes; clicks on the image/controls do not bubble up to here.
  function onBackdrop(event: MouseEvent): void {
    if (event.target === overlayEl || event.target === stageEl) onClose();
  }

  // Touch swipe: a horizontal drag past the threshold steps within the group.
  const SWIPE = 45;
  let startX: number | null = null;
  function onTouchStart(event: TouchEvent): void {
    startX = event.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(event: TouchEvent): void {
    if (startX === null) return;
    const dx = (event.changedTouches[0]?.clientX ?? startX) - startX;
    startX = null;
    if (Math.abs(dx) > SWIPE && multi) (dx < 0 ? next : prev)();
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

<div
  class="lightbox open"
  role="dialog"
  aria-modal="true"
  aria-label="Galerie"
  tabindex="-1"
  bind:this={overlayEl}
  onclick={onBackdrop}
  onkeydown={onKey}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
>
  <button class="lb-close" type="button" aria-label="Schließen" bind:this={closeBtn} onclick={onClose}
    >×</button
  >
  {#if multi}
    <button class="lb-nav lb-prev" type="button" aria-label="Vorheriges Bild" onclick={prev}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="M11 3L5 9l6 6" /></svg
      >
    </button>
    <button class="lb-nav lb-next" type="button" aria-label="Nächstes Bild" onclick={next}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"><path d="M7 3l6 6-6 6" /></svg
      >
    </button>
  {/if}
  <div class="lb-stage" bind:this={stageEl}>
    <div class="lb-frame"><img src={imageUrl(imageIds[current]!, 'display')} alt="" /></div>
    {#if caption}
      <div class="lb-cap">{caption}</div>
    {/if}
    <div class="lb-count">{multi ? `${current + 1} / ${count}` : ''}</div>
  </div>
</div>
