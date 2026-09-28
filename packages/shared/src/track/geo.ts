/** Mean earth radius in metres (IUGG). */
export const R_EARTH = 6371008.8;

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Great-circle distance in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}
