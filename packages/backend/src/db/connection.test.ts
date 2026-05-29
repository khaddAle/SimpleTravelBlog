import { describe, it, expect, afterAll } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from './connection.js';

// This suite manages its own server (it tests connect/disconnect directly), so
// it does NOT use the shared useTestDatabase helper.
describe('connectMongo / disconnectMongo', () => {
  let replSet: MongoMemoryReplSet;

  afterAll(async () => {
    await replSet?.stop();
  });

  it('connects to a replica set and disconnects cleanly', async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectMongo(replSet.getUri(), { autoIndex: false });
    expect(mongoose.connection.readyState).toBe(1);
    await disconnectMongo();
    expect(mongoose.connection.readyState).toBe(0);
  });
});
