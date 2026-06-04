import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { ZodError, z } from 'zod';
import { createPostRequestSchema, updatePostRequestSchema } from '@stb/shared';
import { Post } from '../db/models/Post.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toPostDto, toPostSummary } from '../dto.js';
import { tripObjectIdForShortId, tripShortIdsByObjectId } from '../posts/trips.js';
import type { RouteContext } from './context.js';

/**
 * Editor-facing post CRUD. All routes require a session; mutations also require
 * the CSRF header. Trips are referenced by their public shortId at the API
 * boundary and resolved to ObjectIds internally.
 */
/**
 * Build a 400 message that names the offending top-level fields, so clients see
 * "invalid post payload: country, placeName" instead of an opaque blanket error.
 */
function invalidPayloadMessage(error: ZodError): string {
  const fields = [...new Set(error.issues.map((i) => String(i.path[0] ?? '?')))];
  return `invalid post payload: ${fields.join(', ')}`;
}

// Admin list projection: the summary fields only — never `blocks`, so the
// "Beiträge" page never pulls article content. The pending-draft flag (Stage 3)
// is derived in toPostSummary from the projected `draft` field's presence.
const SUMMARY_PROJECTION = {
  shortId: 1,
  title: 1,
  subtitle: 1,
  postDate: 1,
  country: 1,
  placeName: 1,
  coverImageId: 1,
  tripId: 1,
  status: 1,
  // Project only that a draft exists, not its (large) body — `1` returns the
  // whole subdoc; in Stage 3 the editor never needs the draft body in the list.
  'draft.savedAt': 1,
} as const;

const listPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

export function registerPostRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

  async function postShortIdExists(id: string): Promise<boolean> {
    return (await Post.exists({ shortId: id })) != null;
  }

  app.get('/api/posts', auth, async (req) => {
    const { limit, offset } = listPostsQuerySchema.parse(req.query ?? {});
    const [total, posts] = await Promise.all([
      Post.countDocuments(),
      (() => {
        let query = Post.find({}, SUMMARY_PROJECTION).sort({ postDate: -1 }).skip(offset);
        if (limit !== undefined) query = query.limit(limit);
        return query.lean();
      })(),
    ]);
    const tripIds = posts.filter((p) => p.tripId).map((p) => String(p.tripId));
    const tripMap = await tripShortIdsByObjectId(tripIds);
    return {
      posts: posts.map((p) =>
        toPostSummary(p, p.tripId ? tripMap.get(String(p.tripId)) : undefined),
      ),
      total,
    };
  });

  app.get<{ Params: { shortId: string } }>(
    '/api/posts/:shortId',
    auth,
    async (req) => {
      const post = await Post.findOne({ shortId: req.params.shortId }).lean();
      if (!post) throw app.httpErrors.notFound('post not found');
      const tripMap = post.tripId
        ? await tripShortIdsByObjectId([String(post.tripId)])
        : undefined;
      return {
        post: toPostDto(post, post.tripId ? tripMap?.get(String(post.tripId)) : undefined),
      };
    },
  );

  app.post('/api/posts', mutate, async (req, reply) => {
    const parsed = createPostRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest(invalidPayloadMessage(parsed.error));
    const data = parsed.data;

    let tripObjectId: string | undefined;
    if (data.tripId) {
      const resolved = await tripObjectIdForShortId(data.tripId);
      if (!resolved) throw app.httpErrors.badRequest('unknown tripId');
      tripObjectId = resolved;
    }

    const shortId = await generateUniqueShortId((id) => postShortIdExists(id));
    const doc = await Post.create({
      shortId,
      title: data.title,
      ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
      blocks: data.blocks,
      postDate: new Date(data.postDate),
      country: data.country,
      placeName: data.placeName,
      lat: data.lat,
      lng: data.lng,
      ...(tripObjectId ? { tripId: new Types.ObjectId(tripObjectId) } : {}),
      ...(data.coverImageId ? { coverImageId: data.coverImageId } : {}),
      // Default to draft for interactive creates; the importer publishes on
      // import by passing status + the original publishedAt (preserved by the
      // model's pre-save hook, which only stamps publishedAt when unset).
      status: data.status ?? 'draft',
      ...(data.publishedAt ? { publishedAt: new Date(data.publishedAt) } : {}),
      authorId: new Types.ObjectId(req.authUser!.id),
    });

    reply.code(201);
    return { post: toPostDto(doc.toObject(), data.tripId) };
  });

  app.patch<{ Params: { shortId: string } }>(
    '/api/posts/:shortId',
    mutate,
    async (req) => {
      const parsed = updatePostRequestSchema.safeParse(req.body);
      if (!parsed.success) throw app.httpErrors.badRequest(invalidPayloadMessage(parsed.error));
      const data = parsed.data;

      const post = await Post.findOne({ shortId: req.params.shortId });
      if (!post) throw app.httpErrors.notFound('post not found');

      let tripShortId: string | undefined;
      if (data.tripId !== undefined) {
        if (data.tripId) {
          const resolved = await tripObjectIdForShortId(data.tripId);
          if (!resolved) throw app.httpErrors.badRequest('unknown tripId');
          post.tripId = new Types.ObjectId(resolved);
          tripShortId = data.tripId;
        } else {
          post.tripId = null;
        }
      } else if (post.tripId) {
        const tripMap = await tripShortIdsByObjectId([String(post.tripId)]);
        tripShortId = tripMap.get(String(post.tripId));
      }

      if (data.title !== undefined) post.title = data.title;
      if (data.subtitle !== undefined) post.subtitle = data.subtitle;
      if (data.blocks !== undefined) post.blocks = data.blocks;
      if (data.postDate !== undefined) post.postDate = new Date(data.postDate);
      if (data.country !== undefined) post.country = data.country;
      if (data.placeName !== undefined) post.placeName = data.placeName;
      if (data.lat !== undefined) post.lat = data.lat;
      if (data.lng !== undefined) post.lng = data.lng;
      if (data.coverImageId !== undefined) post.coverImageId = data.coverImageId || null;
      if (data.status !== undefined) post.status = data.status;

      await post.save();
      return { post: toPostDto(post.toObject(), tripShortId) };
    },
  );

  // Autosave. A published post protects its live article by stashing the edit in
  // a `draft` subdoc (saved with timestamps:false so `updatedAt` — which readers
  // and the sitemap rely on — is not bumped). A never-published draft has no live
  // version to protect, so the edit applies straight to the main document.
  app.put<{ Params: { shortId: string } }>('/api/posts/:shortId/draft', mutate, async (req) => {
    const parsed = createPostRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest(invalidPayloadMessage(parsed.error));
    const data = parsed.data;

    const post = await Post.findOne({ shortId: req.params.shortId });
    if (!post) throw app.httpErrors.notFound('post not found');

    // The draft stores the trip by shortId, but validate it resolves now so a
    // dangling reference can't slip in and only fail later at publish time.
    if (data.tripId) {
      const resolved = await tripObjectIdForShortId(data.tripId);
      if (!resolved) throw app.httpErrors.badRequest('unknown tripId');
    }

    const savedAt = new Date();
    if (post.status === 'published') {
      post.set('draft', {
        title: data.title,
        ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
        blocks: data.blocks,
        postDate: new Date(data.postDate),
        country: data.country,
        placeName: data.placeName,
        lat: data.lat,
        lng: data.lng,
        ...(data.tripId ? { tripId: data.tripId } : {}),
        ...(data.coverImageId ? { coverImageId: data.coverImageId } : {}),
        savedAt,
      });
      await post.save({ timestamps: false });
      return { savedAt: savedAt.toISOString(), hasPendingDraft: true };
    }

    let tripObjectId: string | undefined;
    if (data.tripId) tripObjectId = (await tripObjectIdForShortId(data.tripId)) ?? undefined;
    post.title = data.title;
    post.subtitle = data.subtitle ?? null;
    post.blocks = data.blocks;
    post.postDate = new Date(data.postDate);
    post.country = data.country;
    post.placeName = data.placeName;
    post.lat = data.lat;
    post.lng = data.lng;
    post.tripId = tripObjectId ? new Types.ObjectId(tripObjectId) : null;
    post.coverImageId = data.coverImageId || null;
    await post.save();
    return { savedAt: post.updatedAt.toISOString(), hasPendingDraft: false };
  });

  // Promote a pending draft to the live article (or publish a draft post as-is).
  app.post<{ Params: { shortId: string } }>('/api/posts/:shortId/publish', mutate, async (req) => {
    const post = await Post.findOne({ shortId: req.params.shortId });
    if (!post) throw app.httpErrors.notFound('post not found');

    let tripShortId: string | undefined;
    if (post.draft) {
      const d = post.draft;
      post.title = d.title;
      post.subtitle = d.subtitle ?? null;
      post.blocks = d.blocks;
      post.postDate = d.postDate;
      post.country = d.country;
      post.placeName = d.placeName;
      post.lat = d.lat;
      post.lng = d.lng;
      post.coverImageId = d.coverImageId ?? null;
      if (d.tripId) {
        const resolved = await tripObjectIdForShortId(d.tripId);
        if (!resolved) throw app.httpErrors.badRequest('unknown tripId');
        post.tripId = new Types.ObjectId(resolved);
        tripShortId = d.tripId;
      } else {
        post.tripId = null;
      }
      post.set('draft', undefined);
    } else if (post.tripId) {
      const tripMap = await tripShortIdsByObjectId([String(post.tripId)]);
      tripShortId = tripMap.get(String(post.tripId));
    }

    post.status = 'published';
    await post.save();
    return { post: toPostDto(post.toObject(), tripShortId) };
  });

  // Drop a pending draft, reverting the editor to the live article. The live
  // content is untouched, so this also saves with timestamps:false.
  app.post<{ Params: { shortId: string } }>(
    '/api/posts/:shortId/discard-draft',
    mutate,
    async (req) => {
      const post = await Post.findOne({ shortId: req.params.shortId });
      if (!post) throw app.httpErrors.notFound('post not found');

      let tripShortId: string | undefined;
      if (post.tripId) {
        const tripMap = await tripShortIdsByObjectId([String(post.tripId)]);
        tripShortId = tripMap.get(String(post.tripId));
      }
      post.set('draft', undefined);
      await post.save({ timestamps: false });
      return { post: toPostDto(post.toObject(), tripShortId) };
    },
  );

  app.delete<{ Params: { shortId: string } }>(
    '/api/posts/:shortId',
    mutate,
    async (req, reply) => {
      const res = await Post.deleteOne({ shortId: req.params.shortId });
      if (res.deletedCount === 0) throw app.httpErrors.notFound('post not found');
      return reply.code(204).send();
    },
  );
}
