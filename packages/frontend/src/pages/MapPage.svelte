<script lang="ts">
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import { api, type MapPoint } from '../lib/api.js';

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
    const map = L.map(mapEl).setView([51.1657, 10.4515], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende',
    }).addTo(map);
    for (const point of points) {
      L.marker([point.lat, point.lng])
        .addTo(map)
        .bindPopup(`<a href="#/beitrag/${point.id}">${point.title}</a>`);
    }
    return () => map.remove();
  });
</script>

<section class="map-page">
  <h1>Karte</h1>
  {#if loading}
    <p>Lädt…</p>
  {/if}
  <div class="map" bind:this={mapEl}></div>

  <ul class="places">
    {#each points as point (point.id)}
      <li>
        <a href={`#/beitrag/${point.id}`}>{point.title} – {point.placeName}</a>
      </li>
    {/each}
  </ul>
</section>

<style>
  .map {
    height: 460px;
    border-radius: 8px;
    background: #edf2f7;
    margin: 1rem 0;
  }
  .places {
    columns: 2;
  }
</style>
