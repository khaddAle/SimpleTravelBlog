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

/** Country/place derived from coordinates; both best-effort and may be absent. */
export interface ReverseGeocodeResult {
  countryCode?: string;
  placeName?: string;
}

interface NominatimRow {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

interface NominatimAddress {
  country_code?: unknown;
  city?: unknown;
  town?: unknown;
  village?: unknown;
  hamlet?: unknown;
  municipality?: unknown;
  county?: unknown;
}

interface NominatimReverseRow {
  address?: NominatimAddress;
  name?: unknown;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

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

/**
 * Resolve coordinates to an ISO country code and a place name (the map picker
 * uses this to pre-fill the required Land/Ortsname fields). Best-effort: returns
 * whatever Nominatim provides, possibly an empty object.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
  });
  const res = await fetch(`${REVERSE_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Reverse-Geocoding fehlgeschlagen (${res.status})`);

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== 'object') return {};
  const row = data as NominatimReverseRow;
  const addr: NominatimAddress = row.address ?? {};

  const result: ReverseGeocodeResult = {};
  if (typeof addr.country_code === 'string' && /^[a-z]{2}$/i.test(addr.country_code)) {
    result.countryCode = addr.country_code.toUpperCase();
  }
  // Prefer the most specific populated-place label, widening to the county.
  const place = [
    addr.city,
    addr.town,
    addr.village,
    addr.hamlet,
    addr.municipality,
    addr.county,
  ].find((v): v is string => typeof v === 'string' && v.length > 0);
  const placeName = place ?? (typeof row.name === 'string' && row.name ? row.name : undefined);
  if (placeName) result.placeName = placeName;
  return result;
}
