import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import type { Block } from '@stb/shared';
import { useTestDatabase } from '../../../tests/db.js';
import { Post } from './Post.js';

const basePost = (overrides: Record<string, unknown> = {}) => ({
  shortId: 'a3kf2x',
  title: 'Auf die Zugspitze',
  subtitle: 'Tag 3',
  blocks: [
    { type: 'paragraph', text: 'Der Aufstieg war steil und schön.' },
    { type: 'quote', text: 'Berge rufen', source: 'Muir' },
  ] as Block[],
  postDate: new Date('2026-05-01T00:00:00.000Z'),
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 47.42,
  lng: 10.98,
  authorId: new mongoose.Types.ObjectId(),
  ...overrides,
});

describe('Post model', () => {
  useTestDatabase();

  it('defaults status to draft and leaves publishedAt unset', async () => {
    const p = await Post.create(basePost());
    expect(p.status).toBe('draft');
    expect(p.publishedAt).toBeFalsy();
  });

  it('builds searchText from title, subtitle, placeName and block text', async () => {
    const p = await Post.create(basePost());
    expect(p.searchText).toContain('Zugspitze');
    expect(p.searchText).toContain('Aufstieg');
    expect(p.searchText).toContain('Muir');
    // Opaque ids / non-text blocks contribute nothing.
    expect(p.searchText).not.toContain('a3kf2x');
  });

  it('stamps publishedAt when a post becomes published', async () => {
    const p = await Post.create(basePost({ status: 'published' }));
    expect(p.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid blocks via the shared schema', async () => {
    await expect(
      Post.create(basePost({ blocks: [{ type: 'video', url: 'x' }] })),
    ).rejects.toThrow();
  });

  it('rejects a non ISO-3166 alpha-2 country', async () => {
    await expect(Post.create(basePost({ country: 'deu' }))).rejects.toThrow();
  });

  it('enforces a unique shortId', async () => {
    await Post.init();
    await Post.create(basePost());
    await expect(Post.create(basePost())).rejects.toThrow(/duplicate key/i);
  });

  it('supports a german full-text search over searchText', async () => {
    await Post.init();
    await Post.create(basePost());
    await Post.create(
      basePost({
        shortId: 'b7yh3z',
        title: 'Am Meer',
        placeName: 'Sylt',
        country: 'DE',
        blocks: [{ type: 'paragraph', text: 'Strandtag mit Wellen und Wind.' }],
      }),
    );
    const found = await Post.find({ $text: { $search: 'Aufstieg' } });
    expect(found).toHaveLength(1);
    expect(found[0]?.shortId).toBe('a3kf2x');
  });
});
