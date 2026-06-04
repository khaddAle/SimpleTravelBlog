import { describe, it, expect } from 'vitest';
import type { PublicPostHead, TripDto } from '@stb/shared';
import { groupBy } from './archive.js';

function post(id: string, over: Partial<PublicPostHead> = {}): PublicPostHead {
  return {
    id,
    title: id,
    postDate: '2026-01-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'x',
    ...over,
  };
}

const trips: TripDto[] = [
  { id: 't1', name: 'Alpen' },
  { id: 't2', name: 'Nordsee' },
];

describe('groupBy', () => {
  it('returns an empty array for no posts', () => {
    expect(groupBy('reise', [], trips)).toEqual([]);
    expect(groupBy('land', [], trips)).toEqual([]);
    expect(groupBy('jahr', [], trips)).toEqual([]);
  });

  describe('mode: reise', () => {
    it('groups by trip with the trip name as label', () => {
      const groups = groupBy(
        'reise',
        [post('a', { tripId: 't1' }), post('b', { tripId: 't2' }), post('c', { tripId: 't1' })],
        trips,
      );
      const alpen = groups.find((g) => g.key === 't1')!;
      expect(alpen.label).toBe('Alpen');
      expect(alpen.posts.map((p) => p.id).sort()).toEqual(['a', 'c']);
    });

    it('pins trip-less posts into an "Ohne Reise" bucket at the bottom', () => {
      const groups = groupBy(
        'reise',
        [
          post('a', { postDate: '2026-05-01T00:00:00.000Z' }),
          post('b', { tripId: 't1', postDate: '2026-01-01T00:00:00.000Z' }),
        ],
        trips,
      );
      // "Ohne Reise" has the newest post but is still pinned last.
      expect(groups[groups.length - 1]!.label).toBe('Ohne Reise');
      expect(groups[0]!.label).toBe('Alpen');
    });
  });

  describe('mode: land', () => {
    it('groups by country with the German name as label', () => {
      const groups = groupBy('land', [post('a', { country: 'FR' }), post('b', { country: 'DE' })], []);
      expect(groups.map((g) => g.label).sort()).toEqual(['Deutschland', 'Frankreich']);
    });

    it('pins placeholder-country posts into an "Ohne Land" bucket at the bottom', () => {
      const groups = groupBy(
        'land',
        [
          post('a', { country: 'XX', postDate: '2026-09-01T00:00:00.000Z' }),
          post('b', { country: 'DE', postDate: '2026-01-01T00:00:00.000Z' }),
        ],
        [],
      );
      expect(groups[groups.length - 1]!.label).toBe('Ohne Land');
      expect(groups[0]!.label).toBe('Deutschland');
    });
  });

  describe('mode: jahr', () => {
    it('groups by calendar year, newest year first', () => {
      const groups = groupBy(
        'jahr',
        [
          post('a', { postDate: '2024-06-01T00:00:00.000Z' }),
          post('b', { postDate: '2026-03-01T00:00:00.000Z' }),
          post('c', { postDate: '2024-11-01T00:00:00.000Z' }),
        ],
        [],
      );
      expect(groups.map((g) => g.label)).toEqual(['2026', '2024']);
      expect(groups[1]!.posts.map((p) => p.id)).toEqual(['c', 'a']);
    });
  });

  it('sorts posts within a group newest-first and groups by latest date desc', () => {
    const groups = groupBy(
      'land',
      [
        post('old', { country: 'DE', postDate: '2026-01-01T00:00:00.000Z' }),
        post('new', { country: 'DE', postDate: '2026-08-01T00:00:00.000Z' }),
        post('it', { country: 'IT', postDate: '2026-05-01T00:00:00.000Z' }),
      ],
      [],
    );
    // DE's newest (Aug) beats IT's (May) → DE group first.
    expect(groups.map((g) => g.label)).toEqual(['Deutschland', 'Italien']);
    expect(groups[0]!.posts.map((p) => p.id)).toEqual(['new', 'old']);
    expect(groups[0]!.latestDate).toBe('2026-08-01T00:00:00.000Z');
  });
});
