import type { TrackSeries } from './build.js';

/** Stored per point: [lat, lon, smoothed ele, seconds from start, cumulative metres]. */
export type TrackRow = [lat: number, lon: number, ele: number, s: number, m: number];

export function simplifyIndices(_tr: TrackSeries, _posTolM?: number, _eleTolM?: number): number[] {
  throw new Error('not implemented');
}

export function toRows(_tr: TrackSeries, _idx?: readonly number[]): TrackRow[] {
  throw new Error('not implemented');
}

export function fromRows(_rows: readonly TrackRow[], _start: number): TrackSeries {
  throw new Error('not implemented');
}
