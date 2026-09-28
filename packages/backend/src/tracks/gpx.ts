import type { RawTrackPoint } from '@stb/shared';

/** A GPX problem the uploader can fix; its German message is shown as is. */
export class GpxError extends Error {
  override name = 'GpxError';
}

export interface ParsedGpx {
  name: string;
  points: RawTrackPoint[];
}

export function parseGpx(_buffer: Buffer): ParsedGpx {
  throw new Error('not implemented');
}
