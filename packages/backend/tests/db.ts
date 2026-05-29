import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Opt-in test database. Integration tests (and model tests) call
 * `useTestDatabase()` at the top level of their suite; pure unit tests do not,
 * so they never pay the cost of booting Mongo.
 *
 * A **replica set** (single node) is used rather than a standalone mongod
 * because the app relies on `$text` indexes and multi-document transactions,
 * both of which require a replica set.
 */
export function useTestDatabase(): void {
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'test' });
  });

  afterEach(async () => {
    // Isolate suites: wipe every collection between tests.
    const { collections } = mongoose.connection;
    await Promise.all(
      Object.values(collections).map((c) => c.deleteMany({})),
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });
}
