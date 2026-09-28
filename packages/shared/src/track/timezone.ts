import type { TrackSeries } from './build.js';
import { naiveLocalToUtc, type PhotoInput } from './photos.js';

export interface OffsetSuggestion {
  /** Minutes east of UTC. */
  offset: number;
  /** German reason shown next to the suggestion. */
  reason: string;
}

/**
 * Prefill for the post's UTC offset: the offset (−12…+14 h, 30 min steps)
 * that puts the most photo times inside the tracks; ties → nearest to the
 * longitude guess (lon/15, plus a rough northern-summer DST hour).
 */
export function suggestOffset(
  tracks: readonly TrackSeries[],
  photos: readonly Pick<PhotoInput, 'takenAt'>[],
): OffsetSuggestion {
  const first = tracks[0]!;
  const lat = first.lat[0]!;
  const month = new Date(first.t[0]!).getUTCMonth();
  const summer = lat > 0 && month >= 3 && month <= 9; // Apr–Oct, rough DST guess
  const lonGuess = Math.round(first.lon[0]! / 15) * 60 + (summer ? 60 : 0);
  const timed = photos.flatMap((p) => (p.takenAt ? [p.takenAt] : []));
  if (!timed.length) return { offset: lonGuess, reason: `Längengrad${summer ? ' + Sommerzeit' : ''}` };

  const tMin = Math.min(...tracks.map((tr) => tr.t[0]!));
  const tMax = Math.max(...tracks.map((tr) => tr.t[tr.t.length - 1]!));
  let best = { offset: lonGuess, score: -Infinity, hits: 0 };
  for (let off = -720; off <= 840; off += 30) {
    const hits = timed.filter((takenAt) => {
      const u = naiveLocalToUtc(takenAt, off);
      return u >= tMin && u <= tMax;
    }).length;
    const score = hits * 10_000 - Math.abs(off - lonGuess);
    if (score > best.score) best = { offset: off, score, hits };
  }
  return { offset: best.offset, reason: `${best.hits}/${timed.length} Fotos im Track` };
}
