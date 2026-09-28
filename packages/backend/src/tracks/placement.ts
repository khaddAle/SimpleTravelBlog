import {
  fromRows,
  placePhotos,
  suggestOffset,
  type Block,
  type OffsetSuggestion,
  type PostTrackRef,
  type TrackPhoto,
} from '@stb/shared';
import { Image } from '../db/models/Image.js';
import { Track, type TrackDoc } from '../db/models/Track.js';
import { imageIdsInBlocks } from '../dto.js';

/** The stored parts of a Track the reader and the placement need. */
export type TrackData = Pick<TrackDoc, 'shortId' | 'stats' | 'moving' | 'points'>;

export interface LoadedTrack {
  ref: PostTrackRef;
  doc: TrackData;
}

export interface Placement {
  /** The post's tracks that still exist, in post order (index = colour). */
  tracks: LoadedTrack[];
  /** Null when no track could be loaded. */
  suggestion: OffsetSuggestion | null;
  /** The offset used: the given one, else the suggestion. */
  utcOffsetMinutes: number;
  photos: TrackPhoto[];
}

/** A post's photos: image and gallery blocks in order, then the cover; de-duplicated. */
export function photoIdsOfPost(blocks: Block[], coverImageId?: string | null): string[] {
  const ids = imageIdsInBlocks(blocks);
  if (coverImageId && !ids.includes(coverImageId)) ids.push(coverImageId);
  return ids;
}

/**
 * Load a post's tracks and photos and place each photo on its track. Shared by
 * the public track route and the editor preview so both agree. Capture times
 * are naive local EXIF times that `readTakenAt` stored as if UTC, so their ISO
 * form without the zone is the naive local time the shared code expects.
 */
export async function loadPlacement({
  refs,
  utcOffsetMinutes,
  imageIds,
}: {
  refs: readonly PostTrackRef[];
  utcOffsetMinutes?: number | undefined;
  imageIds: readonly string[];
}): Promise<Placement> {
  const wanted = refs.slice(0, 2);
  const docs = await Track.find(
    { shortId: { $in: wanted.map((r) => r.trackId) } },
    { shortId: 1, stats: 1, moving: 1, points: 1 },
  ).lean();
  const byId = new Map(docs.map((d) => [d.shortId, d]));
  const tracks = wanted.flatMap((ref): LoadedTrack[] => {
    const doc = byId.get(ref.trackId);
    return doc ? [{ ref, doc }] : [];
  });
  if (!tracks.length) {
    return { tracks, suggestion: null, utcOffsetMinutes: utcOffsetMinutes ?? 0, photos: [] };
  }

  const ids = [...new Set(imageIds)];
  const images = ids.length
    ? await Image.find(
        { shortId: { $in: ids } },
        { shortId: 1, originalFilename: 1, takenAt: 1 },
      ).lean()
    : [];
  const byImage = new Map(images.map((i) => [i.shortId, i]));
  const inputs = ids.flatMap((imageId) => {
    const img = byImage.get(imageId);
    if (!img) return [];
    const takenAt = img.takenAt ? img.takenAt.toISOString().slice(0, 19) : null;
    return [{ imageId, file: img.originalFilename, takenAt }];
  });

  const series = tracks.map((t) => fromRows(t.doc.points, t.doc.stats.start));
  const suggestion = suggestOffset(series);
  const offset = utcOffsetMinutes ?? suggestion.offset;
  const placed = placePhotos(
    inputs,
    series,
    tracks.map((t) => t.ref.prefix),
    offset,
  );
  return {
    tracks,
    suggestion,
    utcOffsetMinutes: offset,
    photos: placed.map((p) => ({ imageId: p.imageId, track: p.track, t: p.t, where: p.where })),
  };
}
