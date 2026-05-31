<script lang="ts">
  import { untrack } from 'svelte';
  import L from 'leaflet';
  import { geocode, type GeocodeResult } from '../../lib/nominatim.js';

  interface Props {
    lat?: number;
    lng?: number;
    onChange: (lat: number, lng: number) => void;
  }

  let { lat, lng, onChange }: Props = $props();

  // Roughly the centre of Germany — a sensible default before a point is chosen.
  const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];

  let mapEl: HTMLDivElement;
  let map: L.Map | undefined;
  let marker: L.Marker | undefined;
  // Seeded once from props; the picker then owns the selection.
  let selectedLat = $state<number | undefined>(untrack(() => lat));
  let selectedLng = $state<number | undefined>(untrack(() => lng));
  let query = $state('');
  let results = $state<GeocodeResult[]>([]);
  let searching = $state(false);
  let searchError = $state('');

  function setPoint(nextLat: number, nextLng: number, recenter = false): void {
    selectedLat = nextLat;
    selectedLng = nextLng;
    if (map) {
      if (marker) marker.setLatLng([nextLat, nextLng]);
      else marker = L.marker([nextLat, nextLng]).addTo(map);
      if (recenter) map.setView([nextLat, nextLng], 12);
    }
    onChange(nextLat, nextLng);
  }

  $effect(() => {
    const hasPoint = selectedLat !== undefined && selectedLng !== undefined;
    const center: [number, number] = hasPoint
      ? [selectedLat!, selectedLng!]
      : DEFAULT_CENTER;
    const instance = L.map(mapEl).setView(center, hasPoint ? 12 : 5);
    map = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(instance);
    if (hasPoint) marker = L.marker(center).addTo(instance);
    instance.on('click', (e: L.LeafletMouseEvent) => setPoint(e.latlng.lat, e.latlng.lng));

    return () => {
      instance.remove();
      map = undefined;
      marker = undefined;
    };
  });

  async function runSearch(event: Event): Promise<void> {
    event.preventDefault();
    searchError = '';
    searching = true;
    try {
      results = await geocode(query);
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Suche fehlgeschlagen';
    } finally {
      searching = false;
    }
  }

  function choose(result: GeocodeResult): void {
    query = result.displayName;
    results = [];
    setPoint(result.lat, result.lng, true);
  }
</script>

<div class="map-picker">
  <form onsubmit={runSearch}>
    <input
      type="search"
      class="search"
      placeholder="Ort suchen"
      aria-label="Ort suchen"
      bind:value={query}
    />
    <button type="submit" class="tb-btn" disabled={searching}>Suchen</button>
  </form>

  {#if searchError}
    <p class="err" role="alert">{searchError}</p>
  {/if}

  {#if results.length > 0}
    <ul class="results">
      {#each results as result (result.displayName)}
        <li>
          <button type="button" onclick={() => choose(result)}>{result.displayName}</button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="map-frame">
    <div class="map" bind:this={mapEl}></div>
    <span class="map-cap">Klicken, um die Position zu setzen</span>
  </div>

  {#if selectedLat !== undefined && selectedLng !== undefined}
    <p class="coords">Gewählt: {selectedLat.toFixed(5)}, {selectedLng.toFixed(5)}</p>
  {:else}
    <p class="coords muted">Noch kein Ort gewählt.</p>
  {/if}
</div>

<style>
  form {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .search {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    padding: 9px 11px;
    border-radius: 6px;
    appearance: none;
  }
  .search:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface);
  }
  .tb-btn {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 9px 14px;
    border-radius: 7px;
    cursor: pointer;
  }
  .tb-btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .tb-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .map-frame {
    position: relative;
    background: var(--surface);
    padding: 8px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame-sm);
  }
  .map {
    height: 240px;
    border: 1px solid var(--keyline);
    background: var(--panel);
  }
  .map-cap {
    position: absolute;
    left: 16px;
    bottom: 16px;
    z-index: 500;
    pointer-events: none;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--faint);
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    padding: 3px 7px;
  }
  .results {
    list-style: none;
    margin: 0 0 10px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: var(--shadow-pop);
  }
  .results button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    background: none;
    border: none;
    border-radius: 5px;
    font: inherit;
    font-size: 14px;
    color: var(--ink);
    cursor: pointer;
  }
  .results button:hover {
    background: var(--panel);
  }
  .coords {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12px;
    color: var(--muted);
    margin: 10px 0 0;
  }
  .muted {
    color: var(--faint);
    font-style: italic;
    font-family: inherit;
  }
  .err {
    color: #b4452f;
    font-size: 13px;
  }
</style>
