import type { FastifyInstance } from 'fastify';
import {
  paginationQuerySchema,
  searchQuerySchema,
  imageVariantSchema,
} from '@stb/shared';
import { Post } from '../db/models/Post.js';
import { Trip } from '../db/models/Trip.js';
import { Image } from '../db/models/Image.js';
import { Settings, SETTINGS_ID } from '../db/models/Settings.js';
import { toPostDto, toTripDto, toSettingsDto, DEFAULT_SETTINGS } from '../dto.js';
import { buildPublishedSearch } from '../posts/search.js';
import { tripObjectIdForShortId, tripShortIdsByObjectId } from '../posts/trips.js';
import type { RouteContext } from './context.js';

const PUBLISHED = { status: 'published' as const };
const SEARCH_LIMIT = 100;

// The WP import stamps geo-less posts with country 'XX' at 0,0 (Null Island).
// On the Karte those would pile up off the African coast and stretch fitBounds,
// so we partition them out as a separate "ohne Ort" count. The two matchers are
// exact complements within the published set.
const PLACEHOLDER_COUNTRY = 'XX';
const LOCATED_MATCH = {
  country: { $ne: PLACEHOLDER_COUNTRY },
  $nor: [{ lat: 0, lng: 0 }],
};
const UNLOCATED_MATCH = {
  $or: [{ country: PLACEHOLDER_COUNTRY }, { lat: 0, lng: 0 }],
};

/** Anonymous reader API. No auth; only published content is exposed. */
export function registerPublicRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { storage } = ctx;

  async function attachTripShortIds<T extends { tripId?: unknown }>(
    posts: T[],
  ): Promise<Map<string, string>> {
    const ids = posts.filter((p) => p.tripId).map((p) => String(p.tripId));
    return tripShortIdsByObjectId(ids);
  }

  app.get('/api/public/posts', async (req) => {
    const { page, pageSize } = paginationQuerySchema.parse(req.query ?? {});
    const [total, posts] = await Promise.all([
      Post.countDocuments(PUBLISHED),
      Post.find(PUBLISHED)
        .sort({ postDate: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    const tripMap = await attachTripShortIds(posts);
    return {
      posts: posts.map((p) =>
        toPostDto(p, p.tripId ? tripMap.get(String(p.tripId)) : undefined),
      ),
      page,
      pageSize,
      total,
    };
  });

  app.get<{ Params: { shortId: string } }>('/api/public/posts/:shortId', async (req) => {
    const post = await Post.findOne({ shortId: req.params.shortId, ...PUBLISHED }).lean();
    if (!post) throw app.httpErrors.notFound('post not found');
    const tripMap = post.tripId
      ? await tripShortIdsByObjectId([String(post.tripId)])
      : undefined;
    return {
      post: toPostDto(post, post.tripId ? tripMap?.get(String(post.tripId)) : undefined),
    };
  });

  app.get('/api/public/search', async (req) => {
    const parsed = searchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) throw app.httpErrors.badRequest('invalid search query');

    let tripObjectId: string | undefined;
    if (parsed.data.tripId) {
      const resolved = await tripObjectIdForShortId(parsed.data.tripId);
      if (!resolved) return { posts: [], total: 0 };
      tripObjectId = resolved;
    }

    const { filter, sort } = buildPublishedSearch(parsed.data, tripObjectId);
    const posts = await Post.find(filter).sort(sort).limit(SEARCH_LIMIT).lean();

    const tripMap = await attachTripShortIds(posts);
    return {
      posts: posts.map((p) =>
        toPostDto(p, p.tripId ? tripMap.get(String(p.tripId)) : undefined),
      ),
      total: posts.length,
    };
  });

  app.get('/api/public/trips', async () => {
    const trips = await Trip.find().sort({ name: 1 }).lean();
    const rows = await Post.aggregate<{ _id: unknown; n: number }>([
      { $match: { tripId: { $ne: null }, ...PUBLISHED } },
      { $group: { _id: '$tripId', n: { $sum: 1 } } },
    ]);
    const counts = new Map(rows.map((r) => [String(r._id), r.n]));
    return {
      trips: trips
        .map((t) => toTripDto(t, counts.get(String(t._id)) ?? 0))
        .filter((t) => (t.postCount ?? 0) > 0),
    };
  });

  app.get('/api/public/map', async () => {
    const [posts, unlocatedCount] = await Promise.all([
      Post.find(
        { ...PUBLISHED, ...LOCATED_MATCH },
        { shortId: 1, title: 1, lat: 1, lng: 1, country: 1, placeName: 1 },
      ).lean(),
      Post.countDocuments({ ...PUBLISHED, ...UNLOCATED_MATCH }),
    ]);
    return {
      points: posts.map((p) => ({
        id: p.shortId,
        title: p.title,
        lat: p.lat,
        lng: p.lng,
        country: p.country,
        placeName: p.placeName,
      })),
      unlocatedCount,
    };
  });

  // Seed data for the Suche page's Land/Monat dropdowns. Computed server-side so
  // the facets stay complete past the first page of posts (the reader's filter
  // options must not depend on pagination).
  app.get('/api/public/facets', async () => {
    const [countries, monthRows] = await Promise.all([
      Post.distinct('country', PUBLISHED),
      Post.aggregate<{ _id: { y: number; m: number } }>([
        { $match: PUBLISHED },
        { $group: { _id: { y: { $year: '$postDate' }, m: { $month: '$postDate' } } } },
      ]),
    ]);
    const months = monthRows.map((r) => r._id.y * 100 + r._id.m).sort((a, b) => a - b);
    return { countries: [...countries].sort(), months };
  });

  app.get('/api/public/settings', async () => {
    const settings = await Settings.findById(SETTINGS_ID).lean();
    return { settings: settings ? toSettingsDto(settings) : DEFAULT_SETTINGS };
  });

  app.get<{ Params: { shortId: string; variant: string } }>(
    '/api/public/images/:shortId/:variant',
    async (req, reply) => {
      const variant = imageVariantSchema.safeParse(req.params.variant);
      if (!variant.success) throw app.httpErrors.notFound('unknown variant');

      const image = await Image.findOne({ shortId: req.params.shortId }).lean();
      if (!image) throw app.httpErrors.notFound('image not found');

      const key = variant.data === 'display' ? image.displayKey : image.thumbKey;
      const bytes = await storage.getObject(key);
      reply.header('Content-Type', 'image/webp');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.send(bytes);
    },
  );
}
