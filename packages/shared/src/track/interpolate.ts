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

export function positionAtTime(_tr: TrackSeries, _time: number): TrackPosition {
  throw new Error('not implemented');
}

export function timeAtDistance(_tr: TrackSeries, _d: number): number {
  throw new Error('not implemented');
}
