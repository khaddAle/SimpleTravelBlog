import { describe, it, expect } from 'vitest';
import {
  loginRequestSchema,
  userDtoSchema,
  createPostRequestSchema,
  updatePostRequestSchema,
  postDtoSchema,
  publicPostHeadSchema,
  postSummarySchema,
  createTripRequestSchema,
  updateTripRequestSchema,
  searchQuerySchema,
  settingsDtoSchema,
  isoCountrySchema,
  latSchema,
  lngSchema,
  queryBooleanSchema,
  paginationQuerySchema,
  imageListQuerySchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  imageVariantSchema,
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

  it('accepts an optional status + publishedAt (importer publish-on-import)', () => {
    const parsed = createPostRequestSchema.parse({
      ...base,
      status: 'published',
      publishedAt: '2019-07-14T07:30:00.000Z',
    });
    expect(parsed.status).toBe('published');
    expect(parsed.publishedAt).toBe('2019-07-14T07:30:00.000Z');
  });

  it('leaves status/publishedAt undefined for an interactive create (→ draft)', () => {
    const parsed = createPostRequestSchema.parse(base);
    expect(parsed.status).toBeUndefined();
    expect(parsed.publishedAt).toBeUndefined();
  });

  it('rejects a non-datetime publishedAt', () => {
    expect(() =>
      createPostRequestSchema.parse({ ...base, publishedAt: '2019-07-14' }),
    ).toThrow();
  });

  it('accepts an optional coverImageId', () => {
    const parsed = createPostRequestSchema.parse({ ...base, coverImageId: 'img7' });
    expect(parsed.coverImageId).toBe('img7');
  });

  it('leaves coverImageId undefined when omitted', () => {
    expect(createPostRequestSchema.parse(base).coverImageId).toBeUndefined();
  });

  it('rejects a non-string coverImageId', () => {
    expect(() =>
      createPostRequestSchema.parse({ ...base, coverImageId: 42 }),
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

describe('postDtoSchema', () => {
  const base = {
    id: 'p1',
    title: 'Berge',
    blocks: [{ type: 'paragraph', text: 'hallo' }],
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    lat: 47.42,
    lng: 10.98,
    status: 'draft',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  it('accepts an optional coverImageId', () => {
    expect(postDtoSchema.parse({ ...base, coverImageId: 'img7' }).coverImageId).toBe(
      'img7',
    );
  });

  it('leaves coverImageId undefined when omitted', () => {
    expect(postDtoSchema.parse(base).coverImageId).toBeUndefined();
  });
});

describe('publicPostHeadSchema', () => {
  const head = {
    id: 'p1',
    title: 'Berge',
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
  };

  it('accepts a minimal head without blocks', () => {
    const parsed = publicPostHeadSchema.parse(head);
    expect(parsed.title).toBe('Berge');
    expect(parsed.subtitle).toBeUndefined();
    expect(parsed.tripId).toBeUndefined();
    expect(parsed.coverImageId).toBeUndefined();
  });

  it('carries optional subtitle, coverImageId and tripId', () => {
    const parsed = publicPostHeadSchema.parse({
      ...head,
      subtitle: 'Untertitel',
      coverImageId: 'cov1',
      tripId: 'trip01',
    });
    expect(parsed).toMatchObject({
      subtitle: 'Untertitel',
      coverImageId: 'cov1',
      tripId: 'trip01',
    });
  });

  it('rejects a bad country code', () => {
    expect(() => publicPostHeadSchema.parse({ ...head, country: 'de' })).toThrow();
  });
});

describe('postSummarySchema', () => {
  const summary = {
    id: 'p1',
    title: 'Berge',
    postDate: '2026-05-01T00:00:00.000Z',
    country: 'DE',
    placeName: 'Zugspitze',
    status: 'published',
    hasPendingDraft: false,
  };

  it('extends the head with status and hasPendingDraft', () => {
    const parsed = postSummarySchema.parse(summary);
    expect(parsed.status).toBe('published');
    expect(parsed.hasPendingDraft).toBe(false);
  });

  it('requires hasPendingDraft to be a boolean', () => {
    expect(() =>
      postSummarySchema.parse({ ...summary, hasPendingDraft: 'yes' }),
    ).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => postSummarySchema.parse({ ...summary, status: 'archived' })).toThrow();
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

describe('updateTripRequestSchema', () => {
  it('requires a non-empty name (same shape as create)', () => {
    expect(updateTripRequestSchema.parse({ name: 'Alpen 2027' }).name).toBe('Alpen 2027');
    expect(() => updateTripRequestSchema.parse({ name: '' })).toThrow();
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

  it('accepts an optional list of backgroundImageIds', () => {
    const parsed = settingsDtoSchema.parse({
      siteTitle: 'Reise',
      accentColor: '#2b6cb0',
      backgroundImageIds: ['bg1', 'bg2'],
    });
    expect(parsed.backgroundImageIds).toEqual(['bg1', 'bg2']);
  });

  it('leaves backgroundImageIds undefined when omitted', () => {
    expect(
      settingsDtoSchema.parse({ siteTitle: 'Reise', accentColor: '#2b6cb0' })
        .backgroundImageIds,
    ).toBeUndefined();
  });

  it('rejects a non-string entry in backgroundImageIds', () => {
    expect(() =>
      settingsDtoSchema.parse({
        siteTitle: 'Reise',
        accentColor: '#2b6cb0',
        backgroundImageIds: ['bg1', 7],
      }),
    ).toThrow();
  });
});

describe('queryBooleanSchema', () => {
  it('parses truthy tokens and treats "false"/absent as false', () => {
    expect(queryBooleanSchema.parse('true')).toBe(true);
    expect(queryBooleanSchema.parse('1')).toBe(true);
    expect(queryBooleanSchema.parse(true)).toBe(true);
    expect(queryBooleanSchema.parse('false')).toBe(false);
    expect(queryBooleanSchema.parse('0')).toBe(false);
    expect(queryBooleanSchema.parse(undefined)).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('coerces strings and applies defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });
  it('rejects pageSize over the cap', () => {
    expect(() => paginationQuerySchema.parse({ pageSize: '101' })).toThrow();
  });
});

describe('imageListQuerySchema', () => {
  it('defaults sort to newest and orphansOnly to false', () => {
    const parsed = imageListQuerySchema.parse({});
    expect(parsed.sort).toBe('newest');
    expect(parsed.orphansOnly).toBe(false);
  });
  it('honors an explicit orphans filter', () => {
    expect(imageListQuerySchema.parse({ orphansOnly: 'true' }).orphansOnly).toBe(true);
  });
  it('leaves excludePostId undefined by default and passes a given one through', () => {
    expect(imageListQuerySchema.parse({}).excludePostId).toBeUndefined();
    expect(imageListQuerySchema.parse({ excludePostId: 'abc123' }).excludePostId).toBe('abc123');
  });
});

describe('createUserRequestSchema', () => {
  it('requires an 8+ char password', () => {
    expect(
      createUserRequestSchema.parse({
        username: 'editor2',
        password: 'longenough',
        role: 'editor',
      }).username,
    ).toBe('editor2');
    expect(() =>
      createUserRequestSchema.parse({ username: 'x', password: 'short', role: 'editor' }),
    ).toThrow();
  });
});

describe('updateUserRequestSchema', () => {
  it('rejects an empty update', () => {
    expect(() => updateUserRequestSchema.parse({})).toThrow();
  });
  it('accepts a single field', () => {
    expect(updateUserRequestSchema.parse({ deactivated: true }).deactivated).toBe(true);
  });
});

describe('imageVariantSchema', () => {
  it('accepts display and thumb only', () => {
    expect(imageVariantSchema.parse('display')).toBe('display');
    expect(imageVariantSchema.parse('thumb')).toBe('thumb');
    expect(() => imageVariantSchema.parse('original')).toThrow();
  });
});
