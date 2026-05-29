import { describe, it, expect } from 'vitest';
import { toDateInputValue, fromDateInputValue, formatDate } from './dates.js';

describe('toDateInputValue', () => {
  it('extracts the date portion', () => {
    expect(toDateInputValue('2026-03-05T13:45:00.000Z')).toBe('2026-03-05');
  });
  it('returns empty for invalid input', () => {
    expect(toDateInputValue('nope')).toBe('');
  });
});

describe('fromDateInputValue', () => {
  it('builds a midnight-UTC ISO string', () => {
    expect(fromDateInputValue('2026-03-05')).toBe('2026-03-05T00:00:00.000Z');
  });
});

describe('formatDate', () => {
  it('formats a long German date', () => {
    expect(formatDate('2026-03-05T00:00:00.000Z')).toBe('5. März 2026');
  });
  it('returns empty for invalid input', () => {
    expect(formatDate('nope')).toBe('');
  });
});
