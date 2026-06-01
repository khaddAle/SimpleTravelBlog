/** A geo-located item — the minimum the viewport helpers need. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** The slice of Leaflet's LatLngBounds the viewport filter relies on. */
export interface ViewportBounds {
  contains(latlng: [number, number]): boolean;
}

/**
 * The points that fall inside the current map viewport. Pure and Leaflet-free so
 * the Karte can recompute its side list on every pan/zoom without rebuilding
 * markers, and so the filter can be unit-tested with a plain fake bounds.
 */
export function visiblePoints<T extends LatLng>(points: T[], bounds: ViewportBounds): T[] {
  return points.filter((p) => bounds.contains([p.lat, p.lng]));
}

/** ~60 m at the equator — enough to separate stacked dots at city zoom. */
const OVERLAP_OFFSET = 0.0006;

/**
 * Fan out markers that share the exact same coordinates so they don't collapse
 * into a single un-clickable pin. The first post at a spot keeps its location;
 * each further post is nudged onto a small ring around it. Deterministic (no
 * randomness) so the layout is stable across renders. The returned coordinates
 * are for the markers only — the list keeps the posts' true locations.
 */
export function spreadOverlaps<T extends LatLng>(points: T[]): T[] {
  const seen = new Map<string, number>();
  return points.map((p) => {
    const key = `${p.lat},${p.lng}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return p;
    const ring = Math.floor((n - 1) / 8) + 1;
    const angle = ((n - 1) % 8) * (Math.PI / 4);
    return {
      ...p,
      lat: p.lat + Math.sin(angle) * OVERLAP_OFFSET * ring,
      lng: p.lng + Math.cos(angle) * OVERLAP_OFFSET * ring,
    };
  });
}
