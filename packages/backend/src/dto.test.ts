import { describe, it, expect } from 'vitest';
import {
  toPostDto,
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

  it('ships a sensible default branding', () => {
    expect(DEFAULT_SETTINGS.siteTitle).toBeTruthy();
    expect(DEFAULT_SETTINGS.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
