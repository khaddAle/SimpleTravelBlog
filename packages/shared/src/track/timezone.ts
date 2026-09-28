import type { TrackSeries } from './build.js';

export interface OffsetSuggestion {
  /** Minutes east of UTC. */
  offset: number;
  /** German reason shown next to the suggestion. */
  reason: string;
}

/**
 * Prefill for the post's UTC offset, from the location only: the first
 * track's longitude in whole hours (lon/15), plus a rough northern-summer DST
 * hour (Apr–Oct). Photo times are deliberately ignored: squeezing more photos
 * into the track picked wrong offsets such as UTC+1:30. Always editable.
 */
export function suggestOffset(tracks: readonly TrackSeries[]): OffsetSuggestion {
  const first = tracks[0]!;
  const month = new Date(first.t[0]!).getUTCMonth();
  const summer = first.lat[0]! > 0 && month >= 3 && month <= 9;
  return {
    offset: Math.round(first.lon[0]! / 15) * 60 + (summer ? 60 : 0),
    reason: `Längengrad${summer ? ' + Sommerzeit' : ''}`,
  };
}
