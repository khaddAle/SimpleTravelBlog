import { describe, it, expect } from 'vitest';
import { createSemaphore } from './semaphore.js';

/** A promise plus its resolver, so a test can hold a task open then release it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSemaphore', () => {
  it('never runs more than max callbacks at once', async () => {
    const sem = createSemaphore(3);
    let running = 0;
    let peak = 0;
    const gate = deferred();

    const tasks = Array.from({ length: 8 }, () =>
      sem.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
      }),
    );

    // Let the first wave acquire their slots before releasing.
    await Promise.resolve();
    await Promise.resolve();
    expect(sem.active).toBe(3);

    gate.resolve();
    await Promise.all(tasks);
    expect(peak).toBe(3);
    expect(sem.active).toBe(0);
  });

  it('drains the full queue — every task runs', async () => {
    const sem = createSemaphore(2);
    const ran: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        sem.run(async () => {
          ran.push(i);
        }),
      ),
    );
    expect(ran.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sem.active).toBe(0);
  });

  it('releases the slot even when the callback throws', async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // The slot is free again, so a following task runs and returns.
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
    expect(sem.active).toBe(0);
  });

  it('wakes queued waiters in FIFO order', async () => {
    const sem = createSemaphore(1);
    const order: number[] = [];
    const first = deferred();

    // Occupy the only slot with a task we control.
    const held = sem.run(async () => {
      order.push(0);
      await first.promise;
    });

    // These three queue behind it; they must run in the order they waited.
    const queued = [1, 2, 3].map((n) =>
      sem.run(async () => {
        order.push(n);
      }),
    );

    first.resolve();
    await Promise.all([held, ...queued]);
    expect(order).toEqual([0, 1, 2, 3]);
  });
});
