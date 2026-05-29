import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';

/**
 * Opt-in test database. Integration tests (and model tests) call
 * `useTestDatabase()` at the top level of their suite; pure unit tests do not.
 *
 * The mongod **replica set** is started once for the whole run by
 * `tests/globalSetup.ts` (a replica set is required for `$text` indexes and
 * multi-document transactions). Each suite connects to that shared instance on
 * its own uniquely-named database, so parallel test files never see each other's
 * data and can safely wipe between tests.
 */
export function useTestDatabase(): void {
  beforeAll(async () => {
    const uri = inject('mongoUri');
    const dbName = `test_${Math.random().toString(36).slice(2)}`;
    await mongoose.connect(uri, { dbName });
  });

  afterEach(async () => {
    // Isolate tests within a suite: wipe every collection between them.
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });
}
