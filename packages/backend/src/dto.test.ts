import { describe, it, expect } from 'vitest';
import {
  toPostDto,
  toPublicPostHead,
  toPostSummary,
  toImageDto,
  toTripDto,
  toUserListItem,
  toSettingsDto,
  imageVariantUrl,
  DEFAULT_SETTINGS,
  type PostLike,
} from './dto.js';

const basePost: PostLike = {
  shortId: 'p1abcd',
  title: 'Berge',
  blocks: [{ type: 'paragraph', text: 'hallo' }],
  postDate: new Date('2026-05-01T00:00:00.000Z'),
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 47.42,
  lng: 10.98,
  status: 'draft',
  createdAt: new Date('2026-05-02T00:00:00.000Z'),
  updatedAt: new Date('2026-05-03T00:00:00.000Z'),
};

describe('toPostDto', () => {
  it('maps a minimal draft, omitting optional fields', () => {
    const dto = toPostDto(basePost);
    expect(dto).toEqual({
      id: 'p1abcd',
      title: 'Berge',
      blocks: [{ type: 'paragraph', text: 'hallo' }],
      postDate: '2026-05-01T00:00:00.000Z',
      country: 'DE',
      placeName: 'Zugspitze',
      lat: 47.42,
      lng: 10.98,
      status: 'draft',
      createdAt: '2026-05-02T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
    });
    expect(dto.subtitle).toBeUndefined();
    expect(dto.tripId).toBeUndefined();
    expect(dto.publishedAt).toBeUndefined();
  });

  it('includes subtitle, trip shortId and publishedAt when present', () => {
    const dto = toPostDto(
      {
        ...basePost,
        subtitle: 'Untertitel',
        status: 'published',
        publishedAt: new Date('2026-05-04T00:00:00.000Z'),
      },
      'trip01',
    );
    expect(dto.subtitle).toBe('Untertitel');
    expect(dto.tripId).toBe('trip01');
    expect(dto.publishedAt).toBe('2026-05-04T00:00:00.000Z');
  });

  it('includes coverImageId when present and omits it otherwise', () => {
    expect(toPostDto({ ...basePost, coverImageId: 'cov123' }).coverImageId).toBe(
      'cov123',
    );
    expect(toPostDto(basePost).coverImageId).toBeUndefined();
  });
});

describe('toPublicPostHead', () => {
  it('maps the head fields and never carries blocks', () => {
    const head = toPublicPostHead(basePost);
    expect(head).toEqual({
      id: 'p1abcd',
      title: 'Berge',
      postDate: '2026-05-01T00:00:00.000Z',
      country: 'DE',
      placeName: 'Zugspitze',
    });
    expect('blocks' in head).toBe(false);
  });

  it('includes subtitle, trip shortId and coverImageId when present', () => {
    const head = toPublicPostHead(
      { ...basePost, subtitle: 'Untertitel', coverImageId: 'cov1' },
      'trip01',
    );
    expect(head).toMatchObject({
      subtitle: 'Untertitel',
      coverImageId: 'cov1',
      tripId: 'trip01',
    });
  });
});

describe('toPostSummary', () => {
  it('adds status and hasPendingDraft (false without a draft)', () => {
    const summary = toPostSummary(basePost);
    expect(summary).toMatchObject({ id: 'p1abcd', status: 'draft', hasPendingDraft: false });
    expect('blocks' in summary).toBe(false);
  });

  it('reports hasPendingDraft when a draft is attached', () => {
    expect(toPostSummary({ ...basePost, draft: { savedAt: 'x' } }).hasPendingDraft).toBe(true);
  });
});

describe('toImageDto', () => {
  it('builds variant URLs from the shortId', () => {
    const dto = toImageDto({
      shortId: 'imgxyz',
      originalFilename: 'foto.jpg',
      mime: 'image/jpeg',
      width: 1600,
      height: 1066,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(dto.displayUrl).toBe('/api/public/images/imgxyz/display');
    expect(dto.thumbUrl).toBe('/api/public/images/imgxyz/thumb');
    expect(dto.width).toBe(1600);
  });
});

describe('imageVariantUrl', () => {
  it('formats both variants', () => {
    expect(imageVariantUrl('a', 'display')).toBe('/api/public/images/a/display');
    expect(imageVariantUrl('a', 'thumb')).toBe('/api/public/images/a/thumb');
  });
});

describe('toTripDto', () => {
  it('omits postCount unless given', () => {
    expect(toTripDto({ shortId: 't1', name: 'Alpen' })).toEqual({
      id: 't1',
      name: 'Alpen',
    });
    expect(toTripDto({ shortId: 't1', name: 'Alpen' }, 3).postCount).toBe(3);
    expect(toTripDto({ shortId: 't1', name: 'Alpen' }, 0).postCount).toBe(0);
  });
});

describe('toUserListItem', () => {
  it('reflects deactivation state', () => {
    const active = toUserListItem({
      _id: 'u1',
      username: 'editor1',
      role: 'editor',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(active.deactivated).toBe(false);
    const inactive = toUserListItem({
      _id: 'u2',
      username: 'old',
      role: 'editor',
      deactivatedAt: new Date('2026-05-02T00:00:00.000Z'),
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(inactive.deactivated).toBe(true);
  });
});

describe('toSettingsDto', () => {
  it('includes logoKey only when set', () => {
    expect(toSettingsDto({ siteTitle: 'S', accentColor: '#abcdef' }).logoKey).toBeUndefined();
    expect(
      toSettingsDto({ siteTitle: 'S', accentColor: '#abcdef', logoKey: 'logo/x.webp' }).logoKey,
    ).toBe('logo/x.webp');
  });

  it('includes backgroundImageIds only when non-empty', () => {
    expect(
      toSettingsDto({ siteTitle: 'S', accentColor: '#abcdef' }).backgroundImageIds,
    ).toBeUndefined();
    expect(
      toSettingsDto({ siteTitle: 'S', accentColor: '#abcdef', backgroundImageIds: [] })
        .backgroundImageIds,
    ).toBeUndefined();
    expect(
      toSettingsDto({
        siteTitle: 'S',
        accentColor: '#abcdef',
        backgroundImageIds: ['bg1', 'bg2'],
      }).backgroundImageIds,
    ).toEqual(['bg1', 'bg2']);
  });

  it('ships a sensible default branding', () => {
    expect(DEFAULT_SETTINGS.siteTitle).toBeTruthy();
    expect(DEFAULT_SETTINGS.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
