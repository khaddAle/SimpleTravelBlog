import { describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  const noSleep = (): Promise<void> => Promise.resolve();

  it('returns the result without retrying when the call succeeds', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a failing call and returns once it succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new Error('fetch failed')) : Promise.resolve('done');
    });
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting all attempts', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('still broken')));
    await expect(withRetry(fn, { attempts: 4, sleep: noSleep })).rejects.toThrow('still broken');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('backs off exponentially between attempts', async () => {
    const delays: number[] = [];
    const sleep = (ms: number): Promise<void> => {
      delays.push(ms);
      return Promise.resolve();
    };
    const fn = vi.fn(() => Promise.reject(new Error('x')));
    await expect(
      withRetry(fn, { attempts: 4, baseDelayMs: 500, sleep }),
    ).rejects.toThrow();
    // One sleep before each retry; none after the final failed attempt.
    expect(delays).toEqual([500, 1000, 2000]);
  });

  it('notifies onRetry for each retry with the attempt number and delay', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn(() => Promise.reject(new Error('x')));
    await expect(
      withRetry(fn, { attempts: 3, baseDelayMs: 100, sleep: noSleep, onRetry }),
    ).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[1]).toBe(1);
    expect(onRetry.mock.calls[1]?.[1]).toBe(2);
  });
});
