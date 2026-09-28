import type { TrackSeries } from './build.js';

/** Max replay position error of the thinned track (confirmed 2026-09-28). */
export const SIMPLIFY_POS_TOL_M = 2;
/** Max smoothed-elevation error of the thinned track (confirmed 2026-09-28). */
export const SIMPLIFY_ELE_TOL_M = 1;

/** Stored per point: [lat, lon, smoothed ele, seconds from start, cumulative metres]. */
export type TrackRow = [lat: number, lon: number, ele: number, s: number, m: number];

/**
 * Time-aware thinning (top-down, "synchronized distance"): a point may go if,
 * at its own timestamp, the position interpolated in time between the kept
 * neighbours is within `posTolM` metres and the smoothed elevation within
 * `eleTolM`. This bounds the replay error, not just the drawn shape.
 * Returns the kept indices, ascending (always first and last).
 */
export function simplifyIndices(
  tr: TrackSeries,
  posTolM = SIMPLIFY_POS_TOL_M,
  eleTolM = SIMPLIFY_ELE_TOL_M,
): number[] {
  const n = tr.t.length;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const kx = Math.cos((tr.lat[0]! * Math.PI) / 180) * 111_320; // m per ° lon
  const ky = 110_540; // m per ° lat
  const stack: [number, number][] = [[0, n - 1]];
  for (let range = stack.pop(); range; range = stack.pop()) {
    const [a, b] = range;
    if (b - a < 2) continue;
    const span = tr.t[b]! - tr.t[a]!;
    let worst = -1;
    let worstScore = 1;
    for (let i = a + 1; i < b; i++) {
      const f = span > 0 ? (tr.t[i]! - tr.t[a]!) / span : 0;
      const at = (arr: readonly number[]): number => arr[a]! + (arr[b]! - arr[a]!) * f;
      const dx = (tr.lon[i]! - at(tr.lon)) * kx;
      const dy = (tr.lat[i]! - at(tr.lat)) * ky;
      const de = Math.abs(tr.ele[i]! - at(tr.ele));
      // Score > 1 means this point breaks a tolerance.
      const score = Math.max(Math.hypot(dx, dy) / posTolM, de / eleTolM);
      if (score > worstScore) {
        worstScore = score;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
  return idx;
}

/** The rows to store: kept points (all when `idx` is omitted), rounded for the wire. */
export function toRows(tr: TrackSeries, idx?: readonly number[]): TrackRow[] {
  const pick = idx ?? tr.t.map((_, i) => i);
  const t0 = tr.t[0]!;
  return pick.map((i) => [
    +tr.lat[i]!.toFixed(6),
    +tr.lon[i]!.toFixed(6),
    +tr.ele[i]!.toFixed(1),
    Math.round((tr.t[i]! - t0) / 1000),
    +tr.dist[i]!.toFixed(1),
  ]);
}

/** Rebuild a series from stored rows; `start` is the track's start in UTC ms. */
export function fromRows(rows: readonly TrackRow[], start: number): TrackSeries {
  return {
    lat: rows.map((r) => r[0]),
    lon: rows.map((r) => r[1]),
    ele: rows.map((r) => r[2]),
    t: rows.map((r) => start + r[3] * 1000),
    dist: rows.map((r) => r[4]),
  };
}
