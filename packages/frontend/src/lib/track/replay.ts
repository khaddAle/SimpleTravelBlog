import type { TimeInterval } from '@stb/shared';

export const GAP_MIN_MS = 5 * 60_000;
export const PHOTO_HOLD_MS = 5000;

export interface Timeline {
  tMin: number;
  tMax: number;
  gaps: TimeInterval[];
}

export interface FrameResult {
  photo?: number;
  closeCard?: boolean;
  holding?: boolean;
  stopped?: boolean;
}

export function buildTimeline(
  _tracks: readonly { stats: { start: number; end: number }; moving: readonly TimeInterval[] }[],
): Timeline {
  throw new Error('not implemented');
}

export function advanceClock(_clock: number, _realMs: number, _speed: number, _tl: Timeline): number {
  throw new Error('not implemented');
}

export function gapAt(_clock: number, _tl: Timeline): TimeInterval | null {
  throw new Error('not implemented');
}

export class Replay {
  clock = 0;
  playing = false;
  speed = 60;
  showPhotos = false;
  constructor(_tl: Timeline, _photoTimes: readonly number[]) {
    throw new Error('not implemented');
  }
  get gap(): TimeInterval | null {
    throw new Error('not implemented');
  }
  seek(_t: number): void {}
  play(_now: number): void {}
  pause(): void {}
  releaseHold(): void {}
  frame(_now: number): FrameResult {
    throw new Error('not implemented');
  }
}
