import { describe, it, expect } from 'vitest';
import type { PostDto, TripDto } from '@stb/shared';
import { groupPosts } from './archive.js';

function post(id: string, country: string, tripId?: string): PostDto {
  return {
    id,
    title: id,
    blocks: [],
    postDate: '2026-01-01T00:00:00.000Z',
    country,
    placeName: 'x',
    lat: 0,
    lng: 0,
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(tripId ? { tripId } : {}),
  };
}

const trips: TripDto[] = [
  { id: 't1', name: 'Alpen' },
  { id: 't2', name: 'Nordsee' },
];

describe('groupPosts', () => {
  it('groups by country then trip, countries sorted', () => {
    const groups = groupPosts(
      [post('a', 'FR', 't1'), post('b', 'DE', 't2'), post('c', 'DE', 't1')],
      trips,
    );
    expect(groups.map((g) => g.country)).toEqual(['DE', 'FR']);
    const de = groups[0]!;
    expect(de.trips.map((t) => t.tripName)).toEqual(['Alpen', 'Nordsee']);
  });

  it('puts the no-trip bucket last with undefined name', () => {
    const groups = groupPosts([post('a', 'DE'), post('b', 'DE', 't1')], trips);
    const de = groups[0]!;
    expect(de.trips[0]!.tripName).toBe('Alpen');
    expect(de.trips[1]!.tripId).toBeUndefined();
    expect(de.trips[1]!.posts.map((p) => p.id)).toEqual(['a']);
  });

  it('returns an empty array for no posts', () => {
    expect(groupPosts([], trips)).toEqual([]);
  });
});
