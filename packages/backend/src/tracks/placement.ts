import type { Block, OffsetSuggestion, PostTrackRef, TrackPhoto } from '@stb/shared';
import type { TrackDoc } from '../db/models/Track.js';

export interface LoadedTrack {
  ref: PostTrackRef;
  doc: TrackDoc;
}

export interface Placement {
  tracks: LoadedTrack[];
  suggestion: OffsetSuggestion | null;
  utcOffsetMinutes: number;
  photos: TrackPhoto[];
}

export function photoIdsOfPost(_blocks: Block[], _coverImageId?: string | null): string[] {
  throw new Error('not implemented');
}

export async function loadPlacement(_args: {
  refs: readonly PostTrackRef[];
  utcOffsetMinutes?: number | undefined;
  imageIds: readonly string[];
}): Promise<Placement> {
  throw new Error('not implemented');
}
