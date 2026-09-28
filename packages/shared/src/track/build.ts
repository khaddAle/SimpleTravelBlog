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

export function buildTrack(
  _points: readonly RawTrackPoint[],
  _opts: BuildTrackOptions = {},
): BuiltTrack {
  throw new Error('not implemented');
}
