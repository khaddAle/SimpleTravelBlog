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

    const { filter, sort, projectScore } = buildPublishedSearch(parsed.data, tripObjectId);
    let query = Post.find(filter);
    if (projectScore) query = query.select({ score: { $meta: 'textScore' } });
    const posts = await query.sort(sort).limit(SEARCH_LIMIT).lean();

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
    const posts = await Post.find(PUBLISHED, {
      shortId: 1,
      title: 1,
      lat: 1,
      lng: 1,
      country: 1,
      placeName: 1,
    }).lean();
    return {
      points: posts.map((p) => ({
        id: p.shortId,
        title: p.title,
        lat: p.lat,
        lng: p.lng,
        country: p.country,
        placeName: p.placeName,
      })),
    };
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
