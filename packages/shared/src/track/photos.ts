import type { TrackSeries } from './build.js';
import { positionAtTime, type TrackPosition } from './interpolate.js';

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

/** A naive local time (EXIF style) as UTC ms: UTC = local − offset. */
export function naiveLocalToUtc(takenAt: string, offsetMin: number): number {
  return Date.parse(`${takenAt}Z`) - offsetMin * 60_000;
}

/** Which track a filename belongs to: first matching prefix, else track 0. */
export function trackForFile(file: string, prefixes: readonly (string | undefined)[]): number {
  const f = file.toLowerCase();
  const idx = prefixes.findIndex((p) => p && f.startsWith(p.toLowerCase()));
  return idx < 0 ? 0 : idx;
}

/**
 * Place photos on their track. Before start → start; after end or no time → end.
 * Sorted by time, then filename.
 */
export function placePhotos<P extends PhotoInput>(
  photos: readonly P[],
  tracks: readonly TrackSeries[],
  prefixes: readonly (string | undefined)[],
  offsetMin: number,
): PlacedPhoto<P>[] {
  if (!tracks.length) return [];
  return photos
    .map((p): PlacedPhoto<P> => {
      const track = trackForFile(p.file, prefixes.slice(0, tracks.length));
      const tr = tracks[track]!;
      const start = tr.t[0]!;
      const end = tr.t[tr.t.length - 1]!;
      if (!p.takenAt) {
        return { ...p, track, utc: null, where: 'notime', t: end, pos: positionAtTime(tr, end) };
      }
      const utc = naiveLocalToUtc(p.takenAt, offsetMin);
      const where = utc < start ? 'before' : utc > end ? 'after' : 'on';
      const t = Math.min(end, Math.max(start, utc));
      return { ...p, track, utc, where, t, pos: positionAtTime(tr, t) };
    })
    .sort((a, b) => a.t - b.t || a.file.localeCompare(b.file));
}

/** Photos sharing a spot (e.g. everything clamped to the end) become one marker. */
export function groupPhotos<P extends PhotoInput>(placed: readonly PlacedPhoto<P>[]): PhotoGroup<P>[] {
  const groups = new Map<string, PhotoGroup<P>>();
  for (const p of placed) {
    const key = `${p.track}:${p.pos.lat.toFixed(5)}:${p.pos.lon.toFixed(5)}`;
    const group = groups.get(key);
    if (group) group.photos.push(p);
    else groups.set(key, { key, track: p.track, pos: p.pos, t: p.t, photos: [p] });
  }
  return [...groups.values()];
}
