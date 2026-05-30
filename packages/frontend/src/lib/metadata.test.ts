import { describe, it, expect } from 'vitest';
import { fillMissingPlace } from './metadata.js';
import type { PostMetadata } from './types.js';

const base: PostMetadata = {
  title: 'Reise',
  postDate: '2026-05-01T00:00:00.000Z',
  country: '',
  placeName: '',
  lat: 0,
  lng: 0,
};

describe('fillMissingPlace', () => {
  it('fills empty Land and Ortsname from the reverse-geocoded point', () => {
    const next = fillMissingPlace(base, { countryCode: 'DE', placeName: 'Berlin' });
    expect(next.country).toBe('DE');
    expect(next.placeName).toBe('Berlin');
  });

  it('never clobbers values the user already provided', () => {
    const filled = { ...base, country: 'FR', placeName: 'Paris' };
    const next = fillMissingPlace(filled, { countryCode: 'DE', placeName: 'Berlin' });
    expect(next.country).toBe('FR');
    expect(next.placeName).toBe('Paris');
  });

  it('fills only the field that is missing', () => {
    const next = fillMissingPlace({ ...base, country: 'FR' }, { countryCode: 'DE', placeName: 'Berlin' });
    expect(next.country).toBe('FR');
    expect(next.placeName).toBe('Berlin');
  });

  it('leaves fields untouched when the geocoder returns nothing', () => {
    const next = fillMissingPlace(base, {});
    expect(next.country).toBe('');
    expect(next.placeName).toBe('');
  });

  it('returns a new object, not the original', () => {
    const next = fillMissingPlace(base, { countryCode: 'DE' });
    expect(next).not.toBe(base);
    expect(base.country).toBe('');
  });
});
