import type { TimeInterval } from '@stb/shared';

/** Idle stretches (nobody moving) longer than this are skipped … */
export const GAP_MIN_MS = 5 * 60_000;
/** … in about this much wall time. */
const GAP_SKIP_REAL_MS = 1000;
/** How long a photo stays open when the replay reaches it. */
export const PHOTO_HOLD_MS = 5000;
/** Longest frame counted, so a stalled tab does not jump ahead. */
const MAX_FRAME_MS = 100;

export interface Timeline {
  tMin: number;
  tMax: number;
  gaps: TimeInterval[];
}

/** What the view has to do after a frame. */
export interface FrameResult {
  /** Open this photo (index in replay order). */
  photo?: number;
  closeCard?: boolean;
  holding?: boolean;
  stopped?: boolean;
}

/** Shared clock range of all tracks and the idle gaps (nobody moving for > 5 min). */
export function buildTimeline(
  tracks: readonly { stats: { start: number; end: number }; moving: readonly TimeInterval[] }[],
): Timeline {
  const tMin = Math.min(...tracks.map((t) => t.stats.start));
  const tMax = Math.max(...tracks.map((t) => t.stats.end));
  const ivs = tracks.flatMap((t) => t.moving).sort((a, b) => a[0] - b[0]);
  const merged: TimeInterval[] = [];
  for (const [a, b] of ivs) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const gaps: TimeInterval[] = [];
  let cursor = tMin;
  for (const [a, b] of merged) {
    if (a - cursor > GAP_MIN_MS) gaps.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (tMax - cursor > GAP_MIN_MS) gaps.push([cursor, tMax]);
  return { tMin, tMax, gaps };
}

export function gapAt(clock: number, tl: Timeline): TimeInterval | null {
  return tl.gaps.find(([a, b]) => clock >= a && clock < b) ?? null;
}

/** Advance the clock by `realMs` of wall time at `speed`×, fast-forwarding gaps. */
export function advanceClock(clock: number, realMs: number, speed: number, tl: Timeline): number {
  let c = clock;
  let rem = realMs;
  while (rem > 0 && c < tl.tMax) {
    const gap = gapAt(c, tl);
    const rate = gap ? Math.max(speed, (gap[1] - gap[0]) / GAP_SKIP_REAL_MS) : speed;
    const stop = gap ? gap[1] : (tl.gaps.find(([a]) => a > c)?.[0] ?? tl.tMax);
    const need = (stop - c) / rate;
    if (rem >= need) {
      c = stop;
      rem -= need;
    } else {
      c += rem * rate;
      rem = 0;
    }
  }
  return Math.min(c, tl.tMax);
}

/**
 * Replay state without the DOM: the view calls `frame` from
 * requestAnimationFrame and applies the result. Photos (times in replay
 * order) open once when the clock passes them and hold the clock for 5 s.
 */
export class Replay {
  clock: number;
  playing = false;
  speed = 60;
  private photosOn = false;
  private holdUntil = 0;
  private lastFrame = 0;
  private readonly shown = new Set<number>();

  constructor(
    readonly timeline: Timeline,
    private readonly photoTimes: readonly number[],
  ) {
    this.clock = timeline.tMin;
  }

  get showPhotos(): boolean {
    return this.photosOn;
  }
  set showPhotos(on: boolean) {
    this.photosOn = on;
    this.resetShown();
  }

  get gap(): TimeInterval | null {
    return gapAt(this.clock, this.timeline);
  }

  seek(t: number): void {
    this.clock = Math.min(this.timeline.tMax, Math.max(this.timeline.tMin, t));
    this.holdUntil = 0;
    this.resetShown();
  }

  play(now: number): void {
    if (this.clock >= this.timeline.tMax) this.seek(this.timeline.tMin);
    this.holdUntil = 0;
    this.playing = true;
    this.lastFrame = now;
  }

  pause(): void {
    this.playing = false;
    this.holdUntil = 0;
  }

  /** The reader closed the photo: carry on without waiting out the hold. */
  releaseHold(): void {
    this.holdUntil = 0;
  }

  frame(now: number): FrameResult {
    if (!this.playing) return {};
    const realMs = Math.min(MAX_FRAME_MS, now - this.lastFrame);
    this.lastFrame = now;
    const result: FrameResult = {};
    if (this.holdUntil) {
      if (now < this.holdUntil) return { holding: true };
      this.holdUntil = 0;
      result.closeCard = true;
    }
    if (this.photosOn) {
      const due = this.photoTimes.findIndex((t, i) => t <= this.clock && !this.shown.has(i));
      if (due >= 0) {
        this.shown.add(due);
        this.holdUntil = now + PHOTO_HOLD_MS;
        return { ...result, photo: due };
      }
    }
    this.clock = advanceClock(this.clock, realMs, this.speed, this.timeline);
    const pending = this.photosOn && this.photoTimes.some((_, i) => !this.shown.has(i));
    if (this.clock >= this.timeline.tMax && !pending) {
      this.playing = false;
      result.stopped = true;
    }
    return result;
  }

  /** Photos before the clock count as seen, so a seek does not replay them. */
  private resetShown(): void {
    this.shown.clear();
    this.photoTimes.forEach((t, i) => {
      if (t < this.clock) this.shown.add(i);
    });
  }
}
