import type { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { createPostRequestSchema, updatePostRequestSchema } from '@stb/shared';
import { Post } from '../db/models/Post.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toPostDto } from '../dto.js';
import { tripObjectIdForShortId, tripShortIdsByObjectId } from '../posts/trips.js';
import type { RouteContext } from './context.js';

/**
 * Editor-facing post CRUD. All routes require a session; mutations also require
 * the CSRF header. Trips are referenced by their public shortId at the API
 * boundary and resolved to ObjectIds internally.
 */
export function registerPostRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

  async function postShortIdExists(id: string): Promise<boolean> {
    return (await Post.exists({ shortId: id })) != null;
  }

  app.get('/api/posts', auth, async () => {
    const posts = await Post.find().sort({ postDate: -1 }).lean();
    const tripIds = posts.filter((p) => p.tripId).map((p) => String(p.tripId));
    const tripMap = await tripShortIdsByObjectId(tripIds);
    return {
      posts: posts.map((p) =>
        toPostDto(p, p.tripId ? tripMap.get(String(p.tripId)) : undefined),
      ),
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
    if (!parsed.success) throw app.httpErrors.badRequest('invalid post payload');
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
      status: 'draft',
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
      if (!parsed.success) throw app.httpErrors.badRequest('invalid post payload');
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
      if (data.status !== undefined) post.status = data.status;

      await post.save();
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
