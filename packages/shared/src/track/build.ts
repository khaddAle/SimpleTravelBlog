import { haversine } from './geo.js';

/** m/s; slower counts as standing. */
export const MOVING_MIN_SPEED = 0.25;
/** A single segment longer than this is a recording pause, not movement. */
export const MAX_MOVING_SEGMENT_MS = 5 * 60_000;
/** ± distance window for elevation smoothing (confirmed 2026-09-28). */
export const ELE_SMOOTH_M = 20;
/** Minimum step counted as ascent/descent (confirmed 2026-09-28). */
export const ELE_THRESHOLD_M = 0;

/** A parsed GPS point. `t` is UTC epoch ms; `ele` is null when the device logged none. */
export interface RawTrackPoint {
  lat: number;
  lon: number;
  ele: number | null;
  t: number;
}

/** Column-wise track: smoothed elevation, UTC ms and cumulative metres per point. */
export interface TrackSeries {
  readonly lat: readonly number[];
  readonly lon: readonly number[];
  readonly ele: readonly number[];
  readonly t: readonly number[];
  readonly dist: readonly number[];
}

export interface TrackStats {
  distance: number;
  ascent: number;
  descent: number;
  movingMs: number;
  start: number;
  end: number;
  minEle: number;
  maxEle: number;
}

/** [start, end] in UTC ms. */
export type TimeInterval = [start: number, end: number];

export interface BuiltTrack extends TrackSeries {
  stats: TrackStats;
  moving: TimeInterval[];
  hasEle: boolean;
}

export interface BuildTrackOptions {
  smoothM?: number;
  threshold?: number;
}

/** Cumulative distance, smoothed elevation, stats and moving intervals of a full track. */
export function buildTrack(
  points: readonly RawTrackPoint[],
  { smoothM = ELE_SMOOTH_M, threshold = ELE_THRESHOLD_M }: BuildTrackOptions = {},
): BuiltTrack {
  const n = points.length;
  if (n < 2) throw new Error('Track braucht mindestens zwei Punkte');
  const lat = points.map((p) => p.lat);
  const lon = points.map((p) => p.lon);
  const t = points.map((p) => p.t);
  const dist = [0];
  for (let i = 1; i < n; i++) dist.push(dist[i - 1]! + haversine(points[i - 1]!, points[i]!));

  // Fill missing elevation by carrying the last known value.
  const hasEle = points.some((p) => p.ele !== null);
  let last = points.find((p) => p.ele !== null)?.ele ?? 0;
  const rawEle = points.map((p) => (p.ele === null ? last : (last = p.ele)));

  // Distance-windowed moving average (two pointers).
  const ele: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && dist[hi]! <= dist[i]! + smoothM) sum += rawEle[hi++]!;
    while (dist[lo]! < dist[i]! - smoothM) sum -= rawEle[lo++]!;
    ele.push(sum / (hi - lo));
  }

  let ascent = 0;
  let descent = 0;
  let ref = ele[0]!;
  for (let i = 1; i < n; i++) {
    const diff = ele[i]! - ref;
    if (diff >= threshold) {
      ascent += diff;
      ref = ele[i]!;
    } else if (diff <= -threshold) {
      descent -= diff;
      ref = ele[i]!;
    }
  }

  // Moving time + merged moving intervals (the replay skips the gaps between them).
  let movingMs = 0;
  const moving: TimeInterval[] = [];
  for (let i = 1; i < n; i++) {
    const dt = t[i]! - t[i - 1]!;
    const isMoving =
      dt <= MAX_MOVING_SEGMENT_MS && (dist[i]! - dist[i - 1]!) / (dt / 1000) >= MOVING_MIN_SPEED;
    if (!isMoving) continue;
    movingMs += dt;
    const lastIv = moving[moving.length - 1];
    if (lastIv && lastIv[1] === t[i - 1]) lastIv[1] = t[i]!;
    else moving.push([t[i - 1]!, t[i]!]);
  }

  return {
    lat,
    lon,
    ele,
    t,
    dist,
    hasEle,
    moving,
    stats: {
      distance: dist[n - 1]!,
      ascent,
      descent,
      movingMs,
      start: t[0]!,
      end: t[n - 1]!,
      minEle: Math.min(...ele),
      maxEle: Math.max(...ele),
    },
  };
}
