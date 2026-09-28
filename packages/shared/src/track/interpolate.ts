import type { TrackSeries } from './build.js';

export interface TrackPosition {
  lat: number;
  lon: number;
  ele: number;
  /** Metres from the start. */
  d: number;
  /** UTC ms, clamped to the track. */
  t: number;
  /** Which side the requested time was clamped from, if any. */
  out: 'before' | 'after' | null;
}

/** Last index i with arr[i] <= v (arr ascending), clamped to [0, n-2]. */
function segmentIndex(arr: readonly number[], v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Position at an absolute UTC time. Clamped to start/end; `out` says which side. */
export function positionAtTime(tr: TrackSeries, time: number): TrackPosition {
  const start = tr.t[0]!;
  const end = tr.t[tr.t.length - 1]!;
  const out = time < start ? 'before' : time > end ? 'after' : null;
  const tc = Math.min(end, Math.max(start, time));
  const i = segmentIndex(tr.t, tc);
  const span = tr.t[i + 1]! - tr.t[i]!;
  const f = span > 0 ? (tc - tr.t[i]!) / span : 0;
  const lerp = (arr: readonly number[]): number => arr[i]! + (arr[i + 1]! - arr[i]!) * f;
  return { lat: lerp(tr.lat), lon: lerp(tr.lon), ele: lerp(tr.ele), d: lerp(tr.dist), t: tc, out };
}

/** Time at which the track first reaches distance d (arrival time, so stops map to their start). */
export function timeAtDistance(tr: TrackSeries, d: number): number {
  const n = tr.dist.length;
  const dc = Math.min(tr.dist[n - 1]!, Math.max(0, d));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tr.dist[mid]! < dc) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return tr.t[0]!;
  const span = tr.dist[lo]! - tr.dist[lo - 1]!;
  const f = span > 0 ? (dc - tr.dist[lo - 1]!) / span : 1;
  return tr.t[lo - 1]! + (tr.t[lo]! - tr.t[lo - 1]!) * f;
}
