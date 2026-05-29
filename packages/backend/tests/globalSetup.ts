import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { GlobalSetupContext } from 'vitest/node';

/**
 * Boot a single in-memory Mongo **replica set** for the entire backend test run
 * and share its URI with every worker via vitest's provide/inject channel.
 *
 * Previously each `useTestDatabase()` suite started its own replica set; with
 * many integration files that meant a dozen concurrent mongod elections, which
 * overran the hook timeout on the constrained CI runner. One shared instance
 * (each test file isolated on its own database) is both faster and reliable. A
 * replica set — not a standalone — is still required for `$text` + transactions.
 */
let replSet: MongoMemoryReplSet | undefined;

export default async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  provide('mongoUri', replSet.getUri());

  return async () => {
    await replSet?.stop();
    replSet = undefined;
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    mongoUri: string;
  }
}
