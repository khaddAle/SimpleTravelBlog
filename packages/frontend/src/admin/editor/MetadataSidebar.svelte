<script lang="ts">
  import { untrack } from 'svelte';
  import type { TripDto } from '@stb/shared';
  import type { PostMetadata } from '../../lib/types.js';
  import { toDateInputValue, fromDateInputValue } from '../../lib/dates.js';
  import { imageUrl } from '../../lib/images.js';
  import { reverseGeocode } from '../../lib/nominatim.js';
  import { fillMissingPlace } from '../../lib/metadata.js';
  import MapPicker from './MapPicker.svelte';

  interface PickOpts {
    orphansOnly?: boolean;
    selected?: string[];
  }

  interface Props {
    metadata: PostMetadata;
    trips: TripDto[];
    onChange: (metadata: PostMetadata) => void;
    pickImage?: (opts?: PickOpts) => Promise<string | null>;
  }

  let { metadata, trips, onChange, pickImage }: Props = $props();

  let value = $state<PostMetadata>(untrack(() => ({ ...metadata })));

  function emit(): void {
    onChange({ ...value });
  }

  function setTrip(id: string): void {
    if (id) value.tripId = id;
    else delete value.tripId;
    emit();
  }

  function setSubtitle(text: string): void {
    if (text) value.subtitle = text;
    else delete value.subtitle;
    emit();
  }

  async function chooseCover(): Promise<void> {
    // Fresh cover → surface unused images first; changing an existing cover →
    // show all so the current one stays reachable.
    const id = await pickImage?.({ orphansOnly: !value.coverImageId });
    if (id) {
      value.coverImageId = id;
      emit();
    }
  }

  function clearCover(): void {
    delete value.coverImageId;
    emit();
  }

  async function handleMapChange(lat: number, lng: number): Promise<void> {
    value.lat = lat;
    value.lng = lng;
    emit();
    // Pre-fill the required Land/Ortsname from the chosen point, but only while
    // they're still empty — so we never clobber a manual entry and avoid a
    // needless geocoder call once both are set. Best-effort: a geocoder failure
    // must never block picking a location.
    const needsPlace = !/^[A-Z]{2}$/.test(value.country) || !value.placeName.trim();
    if (!needsPlace) return;
    try {
      const filled = fillMissingPlace(value, await reverseGeocode(lat, lng));
      value.country = filled.country;
      value.placeName = filled.placeName;
      emit();
    } catch {
      // ignore — the user can still type Land/Ortsname by hand
    }
  }
</script>

<aside class="metadata">
  <label>
    Titel
    <input
      type="text"
      value={value.title}
      oninput={(e) => {
        value.title = e.currentTarget.value;
        emit();
      }}
    />
  </label>

  <label>
    Untertitel
    <input
      type="text"
      value={value.subtitle ?? ''}
      oninput={(e) => setSubtitle(e.currentTarget.value)}
    />
  </label>

  <label>
    Datum
    <input
      type="date"
      value={toDateInputValue(value.postDate)}
      oninput={(e) => {
        value.postDate = fromDateInputValue(e.currentTarget.value);
        emit();
      }}
    />
  </label>

  <label>
    <span class="req">Land (ISO, z. B. DE)</span>
    <input
      type="text"
      maxlength="2"
      required
      value={value.country}
      oninput={(e) => {
        value.country = e.currentTarget.value.toUpperCase();
        emit();
      }}
    />
  </label>

  <label>
    <span class="req">Ortsname</span>
    <input
      type="text"
      required
      value={value.placeName}
      oninput={(e) => {
        value.placeName = e.currentTarget.value;
        emit();
      }}
    />
  </label>

  <label>
    Reise
    <select value={value.tripId ?? ''} onchange={(e) => setTrip(e.currentTarget.value)}>
      <option value="">— keine —</option>
      {#each trips as trip (trip.id)}
        <option value={trip.id}>{trip.name}</option>
      {/each}
    </select>
  </label>

  <div class="cover-field">
    <span class="cover-label">Titelbild</span>
    {#if value.coverImageId}
      <img class="cover-thumb" src={imageUrl(value.coverImageId, 'thumb')} alt="" />
    {/if}
    <div class="cover-actions">
      <button type="button" onclick={chooseCover}>
        {value.coverImageId ? 'Bild ändern' : 'Bild wählen'}
      </button>
      {#if value.coverImageId}
        <button type="button" onclick={clearCover}>Entfernen</button>
      {/if}
    </div>
  </div>

  <div class="map-field">
    <span class="map-label">Ort auf der Karte</span>
    <MapPicker
      lat={value.lat}
      lng={value.lng}
      onChange={(lat, lng) => void handleMapChange(lat, lng)}
    />
  </div>
</aside>

<style>
  .metadata {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  label {
    display: flex;
    flex-direction: column;
    font-size: 0.85rem;
    font-weight: 600;
    color: #4a5568;
    gap: 0.25rem;
  }
  input,
  select {
    font: inherit;
    font-weight: 400;
    padding: 0.4rem;
  }
  .map-label,
  .cover-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #4a5568;
  }
  /* Visual required marker; rendered via CSS so it stays out of the input's
     accessible name (label queries keep matching "Ortsname"). */
  .req::after {
    content: ' *';
    color: #c53030;
  }
  .cover-field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .cover-thumb {
    width: 100%;
    height: 120px;
    object-fit: cover;
    border-radius: 6px;
  }
  .cover-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
