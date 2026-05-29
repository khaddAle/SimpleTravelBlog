import { describe, it, expect } from 'vitest';
import { imageUrl } from './images.js';

describe('imageUrl', () => {
  it('defaults to the display variant', () => {
    expect(imageUrl('abc123')).toBe('/api/public/images/abc123/display');
  });

  it('builds the thumb variant', () => {
    expect(imageUrl('abc123', 'thumb')).toBe('/api/public/images/abc123/thumb');
  });
});
