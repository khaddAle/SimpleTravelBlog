<script lang="ts">
  import L from 'leaflet';
  import { api } from '../../lib/api.js';
  import { buildTrackModel, type TrackModel } from '../../lib/track/model.js';
  import { addTrackTiles } from '../../lib/track/tiles.js';
  import { drawTracks } from '../../lib/track/draw.js';
  import ElevationProfile from './ElevationProfile.svelte';
  import TrackStats from './TrackStats.svelte';

  let { postId }: { postId: string } = $props();

  let model = $state<TrackModel | null>(null);
  let mapEl = $state<HTMLDivElement | undefined>(undefined);

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
      <div class="track-map" bind:this={mapEl}></div>
      <ElevationProfile {model} />
    </div>
    <div class="track-foot">
      <TrackStats {model} />
    </div>
  </section>
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
