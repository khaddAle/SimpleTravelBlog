/** Mean earth radius in metres (IUGG). */
export const R_EARTH = 6371008.8;

export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Great-circle distance in metres. */
export function haversine(_a: LatLon, _b: LatLon): number {
  throw new Error('not implemented');
}
