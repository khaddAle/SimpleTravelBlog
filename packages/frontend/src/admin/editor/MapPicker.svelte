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
    <input type="search" placeholder="Ort suchen" aria-label="Ort suchen" bind:value={query} />
    <button type="submit" disabled={searching}>Suchen</button>
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

  <div class="map" bind:this={mapEl}></div>

  {#if selectedLat !== undefined && selectedLng !== undefined}
    <p class="coords">Gewählt: {selectedLat.toFixed(5)}, {selectedLng.toFixed(5)}</p>
  {:else}
    <p class="coords muted">Noch kein Ort gewählt.</p>
  {/if}
</div>

<style>
  .map {
    height: 300px;
    border-radius: 6px;
    background: #edf2f7;
  }
  .results {
    list-style: none;
    margin: 0.25rem 0;
    padding: 0;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
  }
  .results button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.4rem 0.6rem;
    background: none;
    border: none;
    cursor: pointer;
  }
  .coords {
    font-size: 0.9rem;
    color: #4a5568;
  }
  .muted {
    color: #a0aec0;
    font-style: italic;
  }
  .err {
    color: #c53030;
  }
</style>
