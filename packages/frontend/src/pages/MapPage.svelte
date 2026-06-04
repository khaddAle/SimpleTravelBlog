<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import L from 'leaflet';
  import type { TripDto } from '@stb/shared';
  import { api, type MapPoint } from '../lib/api.js';
  import { countryName } from '../lib/countries.js';
  import { visiblePoints, spreadOverlaps } from '../lib/mapViewport.js';
  import SiteHeader from '../components/SiteHeader.svelte';
  import SiteFooter from '../components/SiteFooter.svelte';

  let mapEl: HTMLDivElement;
  let points = $state<MapPoint[]>([]);
  // Reisen with at least one published post; seeds the Karte's Reise filter.
  let trips = $state<TripDto[]>([]);
  // '' = Alle Reisen (no filter); otherwise a trip shortId.
  let selectedTripId = $state('');
  // Published posts the WP import left without a location — surfaced as a count,
  // never as fake markers at Null Island.
  let unlocatedCount = $state(0);
  let loading = $state(true);

  // Ids currently inside the map viewport; the side list mirrors the map view.
  let visibleIds = $state<Set<string>>(new Set());
  // The post highlighted by a hover, on either the list or the map.
  let highlightId = $state<string | null>(null);

  // Markers are built once and kept by id; pan/zoom only recomputes the visible
  // set and toggles a highlight class — markers are never rebuilt.
  const markerById = new SvelteMap<string, L.Marker>();
  // $state so building the map re-triggers the filter effect (which otherwise
  // bails before reading any reactive value and would capture no dependency).
  let mapRef = $state<L.Map | undefined>(undefined);

  // Markers stay built once; the Reise filter only shows/hides them client-side.
  const filteredPoints = $derived(
    selectedTripId ? points.filter((p) => p.tripId === selectedTripId) : points,
  );
  const visibleList = $derived(filteredPoints.filter((p) => visibleIds.has(p.id)));
  const offscreenCount = $derived(filteredPoints.length - visibleList.length);

  onMount(async () => {
    try {
      const [data, tripList] = await Promise.all([api.publicMap(), api.publicTrips()]);
      points = data.points;
      unlocatedCount = data.unlocatedCount;
      trips = tripList;
    } finally {
      loading = false;
    }
  });

  function recomputeVisible(): void {
    if (!mapRef) return;
    const inView = visiblePoints(filteredPoints, mapRef.getBounds());
    visibleIds = new Set(inView.map((p) => p.id));
  }

  // Build the map once the points have loaded and the container is mounted.
  $effect(() => {
    if (loading) return;
    const map = L.map(mapEl);
    mapRef = map;
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
    const markers = spreadOverlaps(points).map((point) => {
      const marker = L.marker([point.lat, point.lng], { icon: dotIcon })
        .addTo(map)
        .bindPopup(
          `<a class="map-pop" href="#/beitrag/${point.id}">${point.title}</a>` +
            `<span class="map-pop-where">${point.placeName}, ${countryName(point.country)}</span>`,
        );
      // Hovering a pin highlights its list row, and vice versa.
      marker.on('mouseover', () => (highlightId = point.id));
      marker.on('mouseout', () => (highlightId = null));
      markerById.set(point.id, marker);
      return marker;
    });
    if (markers.length === 0) {
      map.setView([51.1657, 10.4515], 4);
    }
    // Keep the list in sync with whatever the map is showing.
    map.on('moveend', recomputeVisible);
    // Initial framing + list sync is handled by the filter effect below, which
    // also reframes whenever the Reise selection changes.
    return () => {
      map.remove();
      markerById.clear();
      mapRef = undefined;
    };
  });

  // Show only the selected reise's markers and reframe the map to them. Reading
  // `mapRef` ($state) and `filteredPoints` (derived) up front makes this re-run
  // when the map is built, the data loads, or the Reise selection changes —
  // including back to "Alle Reisen".
  $effect(() => {
    const map = mapRef;
    const keep = new Set(filteredPoints.map((p) => p.id));
    if (!map) return;
    const shown: L.Marker[] = [];
    for (const [id, marker] of markerById) {
      if (keep.has(id)) {
        marker.addTo(map);
        shown.push(marker);
      } else {
        map.removeLayer(marker);
      }
    }
    if (shown.length > 0) {
      map.fitBounds(L.featureGroup(shown).getBounds().pad(0.2));
    }
    recomputeVisible();
  });

  // Mirror the hovered post onto its marker without touching the others.
  $effect(() => {
    const active = highlightId;
    for (const [id, marker] of markerById) {
      marker.getElement()?.classList.toggle('map-pin--active', id === active);
    }
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
    {#if trips.length > 0}
      <label class="reise-filter">
        <span class="lbl">Reise</span>
        <select bind:value={selectedTripId}>
          <option value="">Alle Reisen</option>
          {#each trips as t (t.id)}
            <option value={t.id}>{t.name}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  <div class="map-layout">
    <div class="map-panel">
      <div class="map" bind:this={mapEl}></div>
      <div class="map-mat"></div>
      <div class="map-cap">Karte · Leaflet + OpenStreetMap</div>
    </div>

    <div class="map-list">
      <div class="head">Im Kartenausschnitt</div>
      {#if loading}
        <p class="status">Lädt…</p>
      {:else if points.length === 0}
        <p class="status">Noch keine verorteten Beiträge.</p>
      {:else}
        {#each visibleList as point, i (point.id)}
          <a
            class="mrow"
            class:active={highlightId === point.id}
            href={`#/beitrag/${point.id}`}
            onmouseenter={() => (highlightId = point.id)}
            onmouseleave={() => (highlightId = null)}
          >
            <span class="ord">{i + 1}</span>
            <span class="t">
              <h4>{point.title}</h4>
              <div class="where">{point.placeName}, {countryName(point.country)}</div>
            </span>
          </a>
        {/each}
        {#if offscreenCount > 0}
          <p class="offscreen">
            {offscreenCount === 1 ? '1 weiterer Ort' : `${offscreenCount} weitere Orte`}
            außerhalb des Ausschnitts – herauszoomen, um alle zu sehen.
          </p>
        {/if}
      {/if}
      {#if !loading && unlocatedCount > 0}
        <p class="unlocated">
          {unlocatedCount === 1
            ? '1 Beitrag ohne Ort'
            : `${unlocatedCount} Beiträge ohne Ort`}
        </p>
      {/if}
    </div>
  </div>
</main>

<SiteFooter />

<style>
  .map-intro {
    padding: 48px 0 26px;
  }
  .reise-filter {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 18px;
  }
  .reise-filter .lbl {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .reise-filter select {
    font: inherit;
    font-size: 14px;
    padding: 7px 11px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 5px;
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
    transition:
      transform 0.12s,
      box-shadow 0.12s;
  }
  /* The pin whose list row (or itself) is hovered grows and rings up. */
  :global(.map-pin--active .map-dot) {
    transform: scale(1.5);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent),
      0 3px 8px rgba(18, 28, 46, 0.5);
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
  .unlocated {
    margin: 10px 8px 0;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--faint);
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
  .mrow:hover,
  .mrow.active {
    background: var(--surface);
  }
  .offscreen {
    margin: 10px 8px 0;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--faint);
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
