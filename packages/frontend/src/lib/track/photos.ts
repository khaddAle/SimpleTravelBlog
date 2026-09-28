import { positionAtTime, type TrackPhoto, type TrackPosition } from '@stb/shared';
import type { TrackModel } from './model.js';

/** A placed photo plus its index in replay order (the order the API sends). */
export type ReaderPhoto = TrackPhoto & { index: number };

export interface ReaderPhotoGroup {
  key: string;
  track: number;
  pos: TrackPosition;
  photos: ReaderPhoto[];
}

/** Photos at the same spot of the same track share one marker and one card. */
export function photoGroups(m: TrackModel): ReaderPhotoGroup[] {
  const groups = new Map<string, ReaderPhotoGroup>();
  m.photos.forEach((p, index) => {
    const track = m.tracks[p.track];
    if (!track) return;
    const pos = positionAtTime(track.series, p.t);
    const key = `${p.track}:${pos.lat.toFixed(5)}:${pos.lon.toFixed(5)}`;
    const photo = { ...p, index };
    const group = groups.get(key);
    if (group) group.photos.push(photo);
    else groups.set(key, { key, track: p.track, pos, photos: [photo] });
  });
  return [...groups.values()];
}
