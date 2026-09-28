import type { TrackSeries } from './build.js';
import type { PhotoInput } from './photos.js';

export interface OffsetSuggestion {
  /** Minutes east of UTC. */
  offset: number;
  /** German reason shown next to the suggestion. */
  reason: string;
}

export function suggestOffset(
  _tracks: readonly TrackSeries[],
  _photos: readonly Pick<PhotoInput, 'takenAt'>[],
): OffsetSuggestion {
  throw new Error('not implemented');
}
