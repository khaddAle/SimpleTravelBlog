import type { TrackSeries } from './build.js';
import type { TrackPosition } from './interpolate.js';

export interface PhotoInput {
  /** Original filename; its prefix picks the track. */
  file: string;
  /** Naive local capture time (ISO without zone), or null. */
  takenAt: string | null;
}

export type PhotoWhere = 'on' | 'before' | 'after' | 'notime';

export interface PhotoPlacement {
  track: number;
  utc: number | null;
  where: PhotoWhere;
  t: number;
  pos: TrackPosition;
}

export type PlacedPhoto<P extends PhotoInput> = P & PhotoPlacement;

export interface PhotoGroup<P extends PhotoInput> {
  key: string;
  track: number;
  pos: TrackPosition;
  t: number;
  photos: PlacedPhoto<P>[];
}

export function naiveLocalToUtc(_takenAt: string, _offsetMin: number): number {
  throw new Error('not implemented');
}

export function trackForFile(_file: string, _prefixes: readonly (string | undefined)[]): number {
  throw new Error('not implemented');
}

export function placePhotos<P extends PhotoInput>(
  _photos: readonly P[],
  _tracks: readonly TrackSeries[],
  _prefixes: readonly (string | undefined)[],
  _offsetMin: number,
): PlacedPhoto<P>[] {
  throw new Error('not implemented');
}

export function groupPhotos<P extends PhotoInput>(_placed: readonly PlacedPhoto<P>[]): PhotoGroup<P>[] {
  throw new Error('not implemented');
}
