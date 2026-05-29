import { beforeAll } from 'vitest';

/**
 * Global, lightweight test setup applied to every backend test file.
 *
 * Mongo is NOT started here — booting a replica set for pure unit tests (hashers,
 * validators, the image pipeline) would be wasteful. Integration tests opt into a
 * database explicitly via `useTestDatabase()` from `tests/db.ts`.
 */
beforeAll(() => {
  // Deterministic, non-secret defaults so config.ts can load under test without
  // a real environment. Individual tests override as needed.
  process.env.NODE_ENV ??= 'test';
  process.env.SESSION_COOKIE_SECRET ??= 'test-session-secret-please-override';
  process.env.CSRF_COOKIE_SECRET ??= 'test-csrf-secret-please-override';
});
