import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from './db.js';

// Phase 1 smoke test: proves the in-memory replica set boots, mongoose connects,
// and a round-trip write/read works — the foundation every model test builds on.
describe('test database infrastructure', () => {
  useTestDatabase();

  it('connects to the in-memory replica set', () => {
    expect(mongoose.connection.readyState).toBe(1); // 1 = connected
  });

  it('responds to a ping', async () => {
    const admin = mongoose.connection.db?.admin();
    const res = await admin?.ping();
    expect(res?.ok).toBe(1);
  });

  it('round-trips a document through a collection', async () => {
    const col = mongoose.connection.collection('smoke');
    const { insertedId } = await col.insertOne({ hello: 'welt' });
    const found = await col.findOne({ _id: insertedId });
    expect(found?.hello).toBe('welt');
  });
});
