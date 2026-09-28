import type { TrackPhoto, TrackPosition } from '@stb/shared';
import type { TrackModel } from './model.js';

export type ReaderPhoto = TrackPhoto & { index: number };

export interface ReaderPhotoGroup {
  key: string;
  track: number;
  pos: TrackPosition;
  photos: ReaderPhoto[];
}

export function photoGroups(_m: TrackModel): ReaderPhotoGroup[] {
  throw new Error('not implemented');
}
