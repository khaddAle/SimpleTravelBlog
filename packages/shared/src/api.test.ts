import { describe, it, expect } from 'vitest';
import {
  loginRequestSchema,
  userDtoSchema,
  createPostRequestSchema,
  updatePostRequestSchema,
  createTripRequestSchema,
  searchQuerySchema,
  settingsDtoSchema,
  isoCountrySchema,
  latSchema,
  lngSchema,
} from './api.js';

describe('scalar schemas', () => {
  it('accepts a valid ISO alpha-2 country and rejects bad ones', () => {
    expect(isoCountrySchema.parse('DE')).toBe('DE');
    expect(() => isoCountrySchema.parse('de')).toThrow();
    expect(() => isoCountrySchema.parse('DEU')).toThrow();
  });

  it('bounds latitude and longitude', () => {
    expect(latSchema.parse(47.1)).toBe(47.1);
    expect(() => latSchema.parse(91)).toThrow();
    expect(lngSchema.parse(-120)).toBe(-120);
    expect(() => lngSchema.parse(181)).toThrow();
  });
});

describe('loginRequestSchema', () => {
  it('accepts username + password', () => {
    expect(loginRequestSchema.parse({ username: 'a', password: 'b' })).toEqual({
      username: 'a',
      password: 'b',
    });
  });
  it('rejects empty username', () => {
    expect(() => loginRequestSchema.parse({ username: '', password: 'b' })).toThrow();
  });
});

describe('userDtoSchema', () => {
  it('validates role enum', () => {
    expect(
      userDtoSchema.parse({ id: '1', username: 'a', role: 'admin' }).role,
    ).toBe('admin');
    expect(() =>
      userDtoSchema.parse({ id: '1', username: 'a', role: 'root' }),
    ).toThrow();
  });
});

describe('createPostRequestSchema', () => {
  const base = {
    title: 'Berge',
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    lat: 47.42,
    lng: 10.98,
    blocks: [{ type: 'paragraph', text: 'hallo' }],
  };

  it('accepts a complete post', () => {
    expect(createPostRequestSchema.parse(base).title).toBe('Berge');
  });

  it('rejects an invalid block inside blocks', () => {
    expect(() =>
      createPostRequestSchema.parse({ ...base, blocks: [{ type: 'nope' }] }),
    ).toThrow();
  });

  it('rejects a non-datetime postDate', () => {
    expect(() =>
      createPostRequestSchema.parse({ ...base, postDate: '2026-05-01' }),
    ).toThrow();
  });
});

describe('updatePostRequestSchema', () => {
  it('allows partial updates with an optional status', () => {
    const parsed = updatePostRequestSchema.parse({ status: 'published' });
    expect(parsed.status).toBe('published');
  });
  it('rejects an unknown status', () => {
    expect(() => updatePostRequestSchema.parse({ status: 'archived' })).toThrow();
  });
});

describe('createTripRequestSchema', () => {
  it('requires a non-empty name', () => {
    expect(createTripRequestSchema.parse({ name: 'Alpen 2026' }).name).toBe(
      'Alpen 2026',
    );
    expect(() => createTripRequestSchema.parse({ name: '' })).toThrow();
  });
});

describe('searchQuerySchema', () => {
  it('accepts an all-optional query', () => {
    expect(searchQuerySchema.parse({})).toEqual({});
    expect(
      searchQuerySchema.parse({ q: 'berge', country: 'DE' }),
    ).toEqual({ q: 'berge', country: 'DE' });
  });
});

describe('settingsDtoSchema', () => {
  it('validates a 6-digit hex accent color', () => {
    expect(
      settingsDtoSchema.parse({ siteTitle: 'Reise', accentColor: '#2b6cb0' })
        .accentColor,
    ).toBe('#2b6cb0');
    expect(() =>
      settingsDtoSchema.parse({ siteTitle: 'Reise', accentColor: 'blue' }),
    ).toThrow();
  });
});
