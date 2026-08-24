import type { Redis } from 'ioredis';
import type { Config } from '../config.js';
import type { AuthHooks } from '../auth/requireAuth.js';
import type { ObjectStorage } from '../storage/s3.js';
import type { ProgressHub } from '../images/progress.js';
import type { Semaphore } from '../lib/semaphore.js';

/** Everything a domain route module needs, assembled once in `buildApp`. */
export interface RouteContext {
  redis: Redis;
  config: Config;
  hooks: AuthHooks;
  storage: ObjectStorage;
  progress: ProgressHub;
  /** Bounds concurrent image pipelines process-wide (see createSemaphore). */
  limiter: Semaphore;
}

/** Escape a user-supplied string for safe use inside a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
