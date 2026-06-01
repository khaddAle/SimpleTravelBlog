<script lang="ts">
  import { untrack } from 'svelte';
  import L from 'leaflet';
  import { geocode, type GeocodeResult } from '../../lib/nominatim.js';

  interface Props {
    lat?: number;
    lng?: number;
    /** Apply the chosen location to the post. */
    onConfirm: (lat: number, lng: number) => void;
    /** Close without changing the post. */
    onCancel: () => void;
  }

  let { lat, lng, onConfirm, onCancel }: Props = $props();

  // Roughly the centre of Germany — a sensible default before a point is chosen.
  const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];

  let mapEl: HTMLDivElement;
  let map: L.Map | undefined;
  let marker: L.Marker | undefined;
  // Provisional selection — only handed to the post on "Standort übernehmen".
  let draftLat = $state<number | undefined>(untrack(() => lat));
  let draftLng = $state<number | undefined>(untrack(() => lng));
  let query = $state('');
  let results = $state<GeocodeResult[]>([]);
  let searching = $state(false);
  let searchError = $state('');

  const hasDraft = $derived(draftLat !== undefined && draftLng !== undefined);

  function setDraft(nextLat: number, nextLng: number, recenter = false): void {
    draftLat = nextLat;
    draftLng = nextLng;
    if (map) {
      if (marker) marker.setLatLng([nextLat, nextLng]);
      else marker = L.marker([nextLat, nextLng]).addTo(map);
      if (recenter) map.setView([nextLat, nextLng], 12);
    }
  }

  $effect(() => {
    const seeded = draftLat !== undefined && draftLng !== undefined;
    const center: [number, number] = seeded ? [draftLat!, draftLng!] : DEFAULT_CENTER;
    const instance = L.map(mapEl).setView(center, seeded ? 12 : 5);
    map = instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(instance);
    if (seeded) marker = L.marker(center).addTo(instance);
    instance.on('click', (e: L.LeafletMouseEvent) => setDraft(e.latlng.lat, e.latlng.lng));
    // The modal lays out after this element mounts, so the map starts at size 0;
    // re-measure once the browser has painted it or the tiles stay grey.
    const raf = requestAnimationFrame(() => instance.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
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
    setDraft(result.lat, result.lng, true);
  }

  function confirm(): void {
    if (draftLat !== undefined && draftLng !== undefined) onConfirm(draftLat, draftLng);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onCancel();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Ort auf großer Karte wählen">
    <div class="dialog-head">
      <h2>Ort auf großer Karte wählen</h2>
      <button type="button" class="x" aria-label="Schließen" onclick={onCancel}>×</button>
    </div>

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

    <div class="dialog-foot">
      {#if hasDraft}
        <p class="coords">Gewählt: {draftLat!.toFixed(5)}, {draftLng!.toFixed(5)}</p>
      {:else}
        <p class="coords muted">Noch kein Ort gewählt.</p>
      {/if}
      <div class="actions">
        <button type="button" class="tb-btn" onclick={onCancel}>Abbrechen</button>
        <button type="button" class="tb-btn primary" disabled={!hasDraft} onclick={confirm}>
          Standort übernehmen
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000; /* above Leaflet's own panes (z-index ~1000) */
    background: rgba(18, 28, 46, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .dialog {
    width: min(880px, 100%);
    max-height: calc(100vh - 48px);
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-pop);
    padding: 20px;
  }
  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .dialog-head h2 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.2px;
    margin: 0;
  }
  .x {
    font-size: 22px;
    line-height: 1;
    color: var(--faint);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 4px;
  }
  .x:hover {
    color: var(--ink);
  }
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
  .tb-btn.primary {
    color: #fff;
    background: var(--accent);
    border-color: var(--accent);
  }
  .map-frame {
    position: relative;
    background: var(--surface);
    padding: 8px;
    border: 1px solid var(--matedge);
    box-shadow: var(--shadow-frame-sm);
  }
  .map {
    height: 460px;
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
  .dialog-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .coords {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 12px;
    color: var(--muted);
    margin: 0;
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
