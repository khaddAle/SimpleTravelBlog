<script lang="ts">
  import { tick } from 'svelte';
  import L from 'leaflet';
  import type { PostDto } from '@stb/shared';
  import { api } from '../../lib/api.js';
  import { buildTrackModel, type TrackModel } from '../../lib/track/model.js';
  import { addTrackTiles } from '../../lib/track/tiles.js';
  import { drawTracks } from '../../lib/track/draw.js';
  import ElevationProfile from './ElevationProfile.svelte';
  import TrackStats from './TrackStats.svelte';
  import TrackDialog from './TrackDialog.svelte';

  let {
    postId,
    title = '',
    images,
  }: { postId: string; title?: string; images?: PostDto['images'] } = $props();

  let model = $state<TrackModel | null>(null);
  let mapEl = $state<HTMLDivElement | undefined>(undefined);
  let openBtn = $state<HTMLButtonElement>();
  let enlarged = $state(false);

  async function closeDialog(): Promise<void> {
    enlarged = false;
    await tick();
    openBtn?.focus();
  }
  function onMapKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enlarged = true;
    }
  }

  // Loaded lazily, apart from the post, so the article renders first. A post
  // without (loadable) tracks answers 404: then the block simply stays away.
  $effect(() => {
    const id = postId;
    model = null;
    let cancelled = false;
    api
      .publicPostTracks(id)
      .then((data) => {
        if (!cancelled && data.tracks.length) model = buildTrackModel(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  // A static overview: no pan/zoom, so the page scrolls freely over it.
  $effect(() => {
    if (!model || !mapEl) return;
    const map = L.map(mapEl, {
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 0.25,
    });
    map.attributionControl.setPrefix(false);
    addTrackTiles(map);
    drawTracks(L.layerGroup().addTo(map), model);
    map.fitBounds(model.bounds, { padding: [24, 24] });
    return () => map.remove();
  });
</script>

{#if model}
  <section class="track-block" aria-label="GPS-Track">
    <div class="track-frame">
      <div
        class="track-map"
        role="button"
        tabindex="0"
        aria-label="Karte vergrößern"
        bind:this={mapEl}
        onclick={() => (enlarged = true)}
        onkeydown={onMapKey}
      ></div>
      <ElevationProfile {model} />
    </div>
    <div class="track-foot">
      <TrackStats {model} />
      <button class="btn" type="button" bind:this={openBtn} onclick={() => (enlarged = true)}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"
          ><path d="M10 2h4v4M6 14H2v-4M14 2 9.5 6.5M2 14l4.5-4.5" /></svg
        >
        Vergrößern
      </button>
    </div>
  </section>
  {#if enlarged}
    <TrackDialog {model} {title} {images} onClose={closeDialog} />
  {/if}
{/if}

<style>
  .track-block {
    margin: 44px 0 54px;
  }
  .track-frame {
    background: var(--surface);
    padding: 12px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame);
  }
  .track-map {
    /* Own stacking context: Leaflet panes (z-index 400+) stay inside the frame
       instead of painting over the sticky site header. */
    isolation: isolate;
    height: 340px;
    border: 1px solid var(--keyline);
    background: var(--panel);
    cursor: zoom-in;
  }
  .track-foot {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-top: 16px;
  }
  @media (max-width: 700px) {
    .track-map {
      height: 260px;
    }
    .track-foot {
      flex-direction: column;
    }
  }
</style>
