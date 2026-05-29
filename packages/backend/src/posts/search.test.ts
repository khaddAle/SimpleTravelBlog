import { describe, it, expect } from 'vitest';
import { buildPublishedSearch } from './search.js';

describe('buildPublishedSearch', () => {
  it('always restricts to published posts and sorts by recency', () => {
    const { filter, sort, projectScore } = buildPublishedSearch({});
    expect(filter).toEqual({ status: 'published' });
    expect(sort).toEqual({ postDate: -1 });
    expect(projectScore).toBe(false);
  });

  it('adds a german $text clause and a relevance sort for a term', () => {
    const { filter, sort, projectScore } = buildPublishedSearch({ q: '  berge  ' });
    expect(filter.$text).toEqual({ $search: 'berge', $language: 'german' });
    expect(sort).toEqual({ score: { $meta: 'textScore' }, postDate: -1 });
    expect(projectScore).toBe(true);
  });

  it('ignores a whitespace-only term', () => {
    const { filter, projectScore } = buildPublishedSearch({ q: '   ' });
    expect(filter.$text).toBeUndefined();
    expect(projectScore).toBe(false);
  });

  it('filters by country and resolved trip id', () => {
    const { filter } = buildPublishedSearch({ country: 'DE' }, '507f1f77bcf86cd799439011');
    expect(filter.country).toBe('DE');
    expect(filter.tripId).toBe('507f1f77bcf86cd799439011');
  });

  it('builds a postDate range from from/to', () => {
    const { filter } = buildPublishedSearch({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    });
    expect(filter.postDate).toEqual({
      $gte: new Date('2026-01-01T00:00:00.000Z'),
      $lte: new Date('2026-12-31T00:00:00.000Z'),
    });
  });

  it('supports an open-ended range', () => {
    const { filter } = buildPublishedSearch({ from: '2026-01-01T00:00:00.000Z' });
    expect(filter.postDate).toEqual({ $gte: new Date('2026-01-01T00:00:00.000Z') });
  });
});
