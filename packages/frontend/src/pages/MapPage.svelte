<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import { api, type MapPoint } from '../lib/api.js';
  import { countryName } from '../lib/countries.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';

  let mapEl: HTMLDivElement;
  let points = $state<MapPoint[]>([]);
  let loading = $state(true);

  onMount(async () => {
    try {
      points = await api.publicMap();
    } finally {
      loading = false;
    }
  });

  // Build the map once the points have loaded and the container is mounted.
  $effect(() => {
    if (loading) return;
    const map = L.map(mapEl);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(map);
    // A Fernweh accent dot instead of Leaflet's default teardrop pin.
    const dotIcon = L.divIcon({
      className: 'map-pin',
      html: '<span class="map-dot"></span>',
      iconSize: [15, 15],
      iconAnchor: [8, 8],
    });
    const markers = points.map((point) =>
      L.marker([point.lat, point.lng], { icon: dotIcon })
        .addTo(map)
        .bindPopup(
          `<a class="map-pop" href="#/beitrag/${point.id}">${point.title}</a>` +
            `<span class="map-pop-where">${point.placeName}, ${countryName(point.country)}</span>`,
        ),
    );
    if (markers.length > 0) {
      // Frame the view around everything we've been, with a little breathing room.
      map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
    } else {
      map.setView([51.1657, 10.4515], 4);
    }
    return () => map.remove();
  });
</script>

<SiteHeader current="karte" />

<main class="wrap">
  <div class="map-intro">
    <p class="eyebrow">Karte</p>
    <h1 class="h-page">Wo wir waren</h1>
    <p class="lede stack-16">
      Jeder Punkt ein Beitrag. Tippe auf einen Ort, um die Reise zu öffnen.
    </p>
  </div>

  <div class="map-layout">
    <div class="map-panel">
      <div class="map" bind:this={mapEl}></div>
      <div class="map-mat"></div>
      <div class="map-cap">Karte · Leaflet + OpenStreetMap</div>
    </div>

    <div class="map-list">
      <div class="head">Alle Orte</div>
      {#if loading}
        <p class="status">Lädt…</p>
      {:else if points.length === 0}
        <p class="status">Noch keine verorteten Beiträge.</p>
      {:else}
        {#each points as point, i (point.id)}
          <a class="mrow" href={`#/beitrag/${point.id}`}>
            <span class="ord">{i + 1}</span>
            <span class="t">
              <h4>{point.title}</h4>
              <div class="where">{point.placeName}, {countryName(point.country)}</div>
            </span>
          </a>
        {/each}
      {/if}
    </div>
  </div>
</main>

<SiteFooter />

<style>
  .map-intro {
    padding: 48px 0 26px;
  }
  .map-layout {
    display: grid;
    grid-template-columns: 1.7fr 1fr;
    gap: 28px;
    align-items: start;
  }
  .map-panel {
    position: relative;
    height: 624px;
    background: var(--panel);
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame);
    overflow: hidden;
  }
  /* The live Leaflet map fills the framed panel. */
  .map {
    position: absolute;
    inset: 0;
  }
  /* Leaflet injects the marker icon outside the component, so style it globally. */
  :global(.map-pin .map-dot) {
    display: block;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--accent);
    border: 2.5px solid #fff;
    box-shadow: 0 2px 6px rgba(18, 28, 46, 0.4);
  }
  /* Inner keyline of the framed print, drawn over the map without blocking it. */
  .map-mat {
    position: absolute;
    inset: 15px;
    border: 1px solid var(--keyline);
    pointer-events: none;
    z-index: 500;
  }
  .map-cap {
    position: absolute;
    left: 26px;
    bottom: 22px;
    z-index: 500;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--faint);
    background: rgba(255, 255, 255, 0.7);
    padding: 5px 9px;
    border: 1px solid var(--line);
    pointer-events: none;
  }
  .map-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 624px;
    overflow: auto;
  }
  .map-list .head {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
    padding: 4px 8px 12px;
  }
  .status {
    padding: 8px;
    color: var(--muted);
  }
  .mrow {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 11px 10px;
    border-radius: 5px;
    text-decoration: none;
    color: inherit;
    transition: background 0.12s;
  }
  .mrow:hover {
    background: var(--surface);
  }
  .mrow .ord {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mrow .t h4 {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
    margin: 0;
  }
  .mrow .t .where {
    font-size: 12px;
    color: var(--faint);
    margin-top: 2px;
  }
  @media (max-width: 860px) {
    .map-layout {
      grid-template-columns: 1fr;
    }
    .map-list {
      max-height: none;
    }
  }
  @media (max-width: 600px) {
    .map-panel {
      height: 430px;
    }
  }
</style>
