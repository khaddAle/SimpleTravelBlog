import { describe, it, expect } from 'vitest';
import { packMasonry, isPortrait } from './masonry.js';

const square = { width: 100, height: 100 };

describe('isPortrait', () => {
  it('is true for a clearly portrait ratio', () => {
    expect(isPortrait({ width: 1000, height: 1500 })).toBe(true);
  });

  it('is false for landscape and for a near-square within the 0.95 threshold', () => {
    expect(isPortrait({ width: 1600, height: 900 })).toBe(false);
    expect(isPortrait(square)).toBe(false); // 1.0 ≥ 0.95
  });

  it('defaults to landscape when dims are missing or invalid', () => {
    expect(isPortrait(undefined)).toBe(false);
    expect(isPortrait({ width: 0, height: 0 })).toBe(false);
  });
});

describe('packMasonry', () => {
  it('returns one array per column', () => {
    expect(packMasonry([square, square], 3)).toHaveLength(3);
  });

  it('places everything in a single column, in source order, when columns=1', () => {
    expect(packMasonry([square, square, square], 1)).toEqual([[0, 1, 2]]);
  });

  it('keeps source order down each column (round-robin for equal heights)', () => {
    // Four equal tiles over two columns: 0,2 left and 1,3 right — increasing.
    expect(packMasonry([square, square, square, square], 2)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('balances by accumulated height, not by count', () => {
    // A tall first tile (3:1 height) makes column 0 the tallest immediately, so
    // the next two short tiles both stack into column 1.
    const dims = [
      { width: 100, height: 300 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ];
    expect(packMasonry(dims, 2)).toEqual([[0], [1, 2]]);
  });

  it('treats missing or zero dimensions as square (still placed, never dropped)', () => {
    const dims = [
      { width: 0, height: 0 },
      undefined as unknown as { width: number; height: number },
      square,
    ];
    const cols = packMasonry(dims, 2);
    // Every index appears exactly once across the columns.
    expect(cols.flat().sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('returns empty columns for an empty input', () => {
    expect(packMasonry([], 3)).toEqual([[], [], []]);
  });

  it('clamps a non-positive column count to one', () => {
    expect(packMasonry([square, square], 0)).toEqual([[0, 1]]);
  });
});
