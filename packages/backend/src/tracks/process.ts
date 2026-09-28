import {
  buildTrack,
  simplifyIndices,
  toRows,
  type TimeInterval,
  type TrackRow,
  type TrackStats,
} from '@stb/shared';
import { parseGpx } from './gpx.js';

export interface ProcessedTrack {
  name: string;
  stats: TrackStats;
  moving: TimeInterval[];
  points: TrackRow[];
}

/**
 * GPX upload → what we store: stats and moving intervals from the full track,
 * points thinned to the stored rows. Throws {@link GpxError} for bad input.
 */
export function processGpx(buffer: Buffer): ProcessedTrack {
  const { name, points } = parseGpx(buffer);
  const track = buildTrack(points);
  return {
    name,
    stats: track.stats,
    moving: track.moving,
    points: toRows(track, simplifyIndices(track)),
  };
}
