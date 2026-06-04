import type {
  Block,
  PostDto,
  PublicPostHead,
  PostSummary,
  TripDto,
  ImageDto,
  ImageVariant,
  SettingsDto,
  UserListItem,
} from '@stb/shared';

/**
 * Document → DTO mappers. The route layer stays thin by delegating all
 * shape/ISO-date conversion here. Inputs are structural (lean docs), so these
 * are pure and unit-testable without a live database.
 */

export interface PostLike {
  shortId: string;
  title: string;
  subtitle?: string | null;
  blocks: unknown;
  postDate: Date;
  country: string;
  placeName: string;
  lat: number;
  lng: number;
  coverImageId?: string | null;
  status: 'draft' | 'published';
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toPostDto(p: PostLike, tripShortId?: string): PostDto {
  return {
    id: p.shortId,
    title: p.title,
    ...(p.subtitle ? { subtitle: p.subtitle } : {}),
    blocks: (p.blocks ?? []) as Block[],
    postDate: p.postDate.toISOString(),
    country: p.country,
    placeName: p.placeName,
    lat: p.lat,
    lng: p.lng,
    ...(tripShortId ? { tripId: tripShortId } : {}),
    ...(p.coverImageId ? { coverImageId: p.coverImageId } : {}),
    status: p.status,
    ...(p.publishedAt ? { publishedAt: p.publishedAt.toISOString() } : {}),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Subset of a post needed for the lightweight list projections (no blocks). */
export interface PostHeadLike {
  shortId: string;
  title: string;
  subtitle?: string | null;
  postDate: Date;
  country: string;
  placeName: string;
  coverImageId?: string | null;
}

/** Map a post to its public head — list views never carry block content. */
export function toPublicPostHead(p: PostHeadLike, tripShortId?: string): PublicPostHead {
  return {
    id: p.shortId,
    title: p.title,
    ...(p.subtitle ? { subtitle: p.subtitle } : {}),
    postDate: p.postDate.toISOString(),
    country: p.country,
    placeName: p.placeName,
    ...(tripShortId ? { tripId: tripShortId } : {}),
    ...(p.coverImageId ? { coverImageId: p.coverImageId } : {}),
  };
}

/** A post with the editorial state the admin list needs on top of the head. */
export interface PostSummaryLike extends PostHeadLike {
  status: 'draft' | 'published';
  // Present (non-null) once a published post carries an unpublished draft.
  draft?: unknown;
}

/** Map a post to its admin summary (head + status + pending-draft flag). */
export function toPostSummary(p: PostSummaryLike, tripShortId?: string): PostSummary {
  return {
    ...toPublicPostHead(p, tripShortId),
    status: p.status,
    hasPendingDraft: p.draft != null,
  };
}

export function imageVariantUrl(shortId: string, variant: ImageVariant): string {
  return `/api/public/images/${shortId}/${variant}`;
}

export interface ImageLike {
  shortId: string;
  originalFilename: string;
  mime: string;
  width: number;
  height: number;
  createdAt: Date;
}

export function toImageDto(i: ImageLike): ImageDto {
  return {
    id: i.shortId,
    originalFilename: i.originalFilename,
    mime: i.mime,
    width: i.width,
    height: i.height,
    displayUrl: imageVariantUrl(i.shortId, 'display'),
    thumbUrl: imageVariantUrl(i.shortId, 'thumb'),
    createdAt: i.createdAt.toISOString(),
  };
}

export interface TripLike {
  shortId: string;
  name: string;
}

export function toTripDto(t: TripLike, postCount?: number): TripDto {
  return {
    id: t.shortId,
    name: t.name,
    ...(postCount === undefined ? {} : { postCount }),
  };
}

export interface UserLike {
  _id: unknown;
  username: string;
  role: 'admin' | 'editor';
  deactivatedAt?: Date | null;
  createdAt: Date;
}

export function toUserListItem(u: UserLike): UserListItem {
  return {
    id: String(u._id),
    username: u.username,
    role: u.role,
    deactivated: u.deactivatedAt != null,
    createdAt: u.createdAt.toISOString(),
  };
}

export interface SettingsLike {
  siteTitle: string;
  accentColor: string;
  logoKey?: string | null;
  backgroundImageIds?: string[] | null;
}

export function toSettingsDto(s: SettingsLike): SettingsDto {
  return {
    siteTitle: s.siteTitle,
    accentColor: s.accentColor,
    ...(s.logoKey ? { logoKey: s.logoKey } : {}),
    ...(s.backgroundImageIds?.length
      ? { backgroundImageIds: s.backgroundImageIds }
      : {}),
  };
}

/** Default branding returned before an admin has saved any settings. */
export const DEFAULT_SETTINGS: SettingsDto = {
  siteTitle: 'Reiseblog',
  accentColor: '#3f6699',
};
