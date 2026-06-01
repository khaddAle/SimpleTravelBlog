import { describe, it, expect } from 'vitest';
import { buildPublishedSearch } from './search.js';

describe('buildPublishedSearch', () => {
  it('always restricts to published posts and sorts by recency', () => {
    const { filter, sort } = buildPublishedSearch({});
    expect(filter).toEqual({ status: 'published' });
    expect(sort).toEqual({ postDate: -1 });
  });

  it('adds a folded literal-substring regex on searchFold for a term', () => {
    const { filter } = buildPublishedSearch({ q: '  Berge  ' });
    // Trimmed, folded (lowercased) and matched as a substring.
    expect(filter.searchFold).toEqual({ $regex: 'berge' });
  });

  it('folds umlauts in the query the same way the stored field is folded', () => {
    const { filter } = buildPublishedSearch({ q: 'München' });
    expect(filter.searchFold).toEqual({ $regex: 'muenchen' });
  });

  it('escapes regex metacharacters so the query matches literally (no ReDoS / injection)', () => {
    const { filter } = buildPublishedSearch({ q: '(a+)+' });
    expect(filter.searchFold).toEqual({ $regex: '\\(a\\+\\)\\+' });
  });

  it('ignores a whitespace-only term', () => {
    const { filter } = buildPublishedSearch({ q: '   ' });
    expect(filter.searchFold).toBeUndefined();
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
