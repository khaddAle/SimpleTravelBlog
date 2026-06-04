import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosaver } from './autosave.js';

const OPTS = { delayMs: 2000, maxWaitMs: 15000 };

/** A manually-settled promise, for driving an in-flight save in tests. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces rapid schedules into a single save after the idle delay', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    await vi.advanceTimersByTimeAsync(1000);
    a.schedule(); // resets the idle timer
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('forces a save by the max-wait cap during continuous typing', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    // Keep scheduling just under the idle delay so the debounce never elapses;
    // only the 15s max-wait cap can fire the save.
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(1900);
      a.schedule();
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps a single save in flight and coalesces a trailing one', async () => {
    const first = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    await vi.advanceTimersByTimeAsync(2000); // save #1 starts, stays in flight
    expect(save).toHaveBeenCalledTimes(1);

    a.schedule(); // edit during flight
    await vi.advanceTimersByTimeAsync(2000); // would dispatch, but #1 in flight
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve();
    await vi.advanceTimersByTimeAsync(0); // trailing save runs on completion
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush triggers an immediate save and resolves when it settles', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);

    // The pending timer was cleared by the flush — no second save later.
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush is a no-op when nothing is pending', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });
    await a.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel drops a pending save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    a.cancel();
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).not.toHaveBeenCalled();
  });

  it('still settles flush callers when a save rejects (errors never hang it)', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const a = createAutosaver({ ...OPTS, save });

    a.schedule();
    await expect(a.flush()).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
