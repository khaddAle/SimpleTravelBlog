import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../../tests/db.js';
import { Post } from '../db/models/Post.js';
import { backfillSearchFold } from './backfillSearchFold.js';

/** Insert a doc straight through the driver, bypassing the pre-save hook, so it
 *  lacks `searchFold` exactly like a pre-migration / imported post. */
async function insertLegacy(over: Record<string, unknown> = {}): Promise<void> {
  await Post.collection.insertOne({
    shortId: 'lg' + Math.floor(Math.random() * 1e6),
    title: 'Alt',
    blocks: [],
    postDate: new Date('2026-05-01T00:00:00.000Z'),
    country: 'DE',
    placeName: 'Zürich',
    lat: 47.37,
    lng: 8.54,
    authorId: new mongoose.Types.ObjectId(),
    status: 'published',
    searchText: 'Über die Alpen nach Zürich',
    ...over,
  });
}

describe('backfillSearchFold', () => {
  useTestDatabase();

  it('fills searchFold for legacy posts that lack it', async () => {
    await insertLegacy();
    const n = await backfillSearchFold();
    expect(n).toBe(1);

    const doc = await Post.findOne({}).lean();
    expect(doc?.searchFold).toBe('ueber die alpen nach zuerich');
  });

  it('is idempotent — a second run touches nothing', async () => {
    await insertLegacy();
    expect(await backfillSearchFold()).toBe(1);
    expect(await backfillSearchFold()).toBe(0);
  });

  it('leaves posts that already have searchFold untouched', async () => {
    await insertLegacy({ searchFold: 'preset' });
    expect(await backfillSearchFold()).toBe(0);
    const doc = await Post.findOne({}).lean();
    expect(doc?.searchFold).toBe('preset');
  });
});
