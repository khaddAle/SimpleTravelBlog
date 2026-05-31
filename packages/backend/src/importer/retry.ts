/**
 * Retry an async operation with exponential backoff. The importer makes
 * thousands of network calls (image downloads from the WP source, uploads over
 * the tunnel) across a run that can last hours; a single transient `fetch
 * failed` would otherwise abort everything and — with no dedup — force a full
 * re-upload. Wrapping each network call in `withRetry` lets a blip self-heal.
 */
export interface RetryOptions {
  /** Total attempts including the first (default 4). */
  attempts?: number;
  /** Delay before the first retry, doubled each subsequent retry (default 500ms). */
  baseDelayMs?: number;
  /** Injectable sleep (tests pass a no-op); defaults to real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each backoff wait with the error, attempt number, and delay. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /**
   * Decide whether a given error is worth retrying. Return false to fail fast
   * without further attempts — e.g. a deterministic failure (a corrupt image the
   * transcoder will always reject) that retrying cannot fix. Defaults to retrying
   * every error.
   */
  shouldRetry?: (err: unknown) => boolean;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 4);
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) break;
      if (opts.shouldRetry && !opts.shouldRetry(err)) break;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}
