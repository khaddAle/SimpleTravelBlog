/**
 * Thin wrapper around the public Nominatim geocoder used by the map picker.
 * Kept out of the component so the URL shape and result mapping are unit-testable
 * without mounting Leaflet. Callers are responsible for throttling (≥1s between
 * requests) per Nominatim's usage policy.
 */
export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimRow {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocode(query: string, limit = 5): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    limit: String(limit),
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Geocoding fehlgeschlagen (${res.status})`);

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row): GeocodeResult | null => {
      const r = row as NominatimRow;
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (typeof r.display_name !== 'string' || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null;
      }
      return { displayName: r.display_name, lat, lng };
    })
    .filter((r): r is GeocodeResult => r !== null);
}
