/**
 * A minimal async counting semaphore: at most `max` `run` callbacks execute
 * concurrently; excess callers wait FIFO for a slot. Used to bound how many
 * memory-heavy image pipelines decode at once, so backend memory is a function
 * of the cap rather than the client's upload burst rate.
 */
export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Slots currently in use — for tests and observability. */
  readonly active: number;
}

export function createSemaphore(max: number): Semaphore {
  let active = 0;
  const waiters: (() => void)[] = [];

  const release = (): void => {
    const wake = waiters.shift();
    if (wake) {
      // Hand the freed slot straight to the next waiter without touching
      // `active` — it never dips between release and acquire, so an arriving
      // caller can never race in and over-subscribe the cap.
      wake();
    } else {
      active--;
    }
  };

  return {
    get active() {
      return active;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= max) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      } else {
        active++;
      }
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
