/**
 * Debounced autosave engine. Timing only — it never captures editor state;
 * `save` is invoked at fire time so it reads the latest content itself (a
 * captured snapshot would let the max-wait timer ship something stale).
 *
 * Guarantees:
 * - Idle debounce (`delayMs`): rapid edits collapse into one save once typing
 *   pauses.
 * - Max-wait cap (`maxWaitMs`): during continuous typing a save still fires, so
 *   work is never held hostage by an endless debounce.
 * - Single-flight + trailing coalesce: at most one save runs at a time; edits
 *   made while one is in flight schedule exactly one more afterwards with the
 *   then-current state. This serialization is what keeps a slow response from
 *   clobbering newer work — responses can't overtake one another.
 * - `flush()` forces an immediate save and resolves once the queue drains (used
 *   on navigate / tab-hide); it never rejects, even if a save throws.
 */
export interface Autosaver {
  /** Note an edit: (re)arm the idle timer; the max-wait cap keeps running. */
  schedule(): void;
  /** Save now and resolve when the in-flight (and any coalesced) save settles. */
  flush(): Promise<void>;
  /** Drop any pending save without firing it. */
  cancel(): void;
}

export interface AutosaverOptions {
  delayMs: number;
  maxWaitMs: number;
  /** Performs one save, reading current editor state. Rejections are swallowed. */
  save: () => Promise<void>;
}

export function createAutosaver(opts: AutosaverOptions): Autosaver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pendingAgain = false;
  let waiters: Array<() => void> = [];

  function clearTimers(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  }

  function runSave(): void {
    clearTimers();
    if (inFlight) {
      pendingAgain = true;
      return;
    }
    inFlight = true;
    void (async () => {
      try {
        await opts.save();
      } catch {
        // The editor surfaces its own save errors; the engine just carries on.
      } finally {
        inFlight = false;
        if (pendingAgain) {
          pendingAgain = false;
          runSave();
        } else {
          const settled = waiters;
          waiters = [];
          for (const resolve of settled) resolve();
        }
      }
    })();
  }

  function schedule(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSave, opts.delayMs);
    // The cap is measured from the first edit after the last save; don't reset it.
    if (maxWaitTimer === null) maxWaitTimer = setTimeout(runSave, opts.maxWaitMs);
  }

  function flush(): Promise<void> {
    if (!inFlight && debounceTimer === null && maxWaitTimer === null && !pendingAgain) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
      runSave();
    });
  }

  function cancel(): void {
    clearTimers();
    pendingAgain = false;
  }

  return { schedule, flush, cancel };
}
