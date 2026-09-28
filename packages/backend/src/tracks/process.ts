import type { TimeInterval, TrackRow, TrackStats } from '@stb/shared';

export interface ProcessedTrack {
  name: string;
  stats: TrackStats;
  moving: TimeInterval[];
  points: TrackRow[];
}

export function processGpx(_buffer: Buffer): ProcessedTrack {
  throw new Error('not implemented');
}
