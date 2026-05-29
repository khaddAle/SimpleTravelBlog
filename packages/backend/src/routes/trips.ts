import type { FastifyInstance } from 'fastify';
import { createTripRequestSchema } from '@stb/shared';
import { Trip } from '../db/models/Trip.js';
import { Post } from '../db/models/Post.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toTripDto } from '../dto.js';
import type { RouteContext } from './context.js';

/** Editor-facing trip management. Deletion is refused while posts reference it. */
export function registerTripRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

  async function postCounts(): Promise<Map<string, number>> {
    const rows = await Post.aggregate<{ _id: unknown; n: number }>([
      { $match: { tripId: { $ne: null } } },
      { $group: { _id: '$tripId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.n]));
  }

  app.get('/api/trips', auth, async () => {
    const [trips, counts] = await Promise.all([
      Trip.find().sort({ name: 1 }).lean(),
      postCounts(),
    ]);
    return { trips: trips.map((t) => toTripDto(t, counts.get(String(t._id)) ?? 0)) };
  });

  app.post('/api/trips', mutate, async (req, reply) => {
    const parsed = createTripRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid trip payload');
    const name = parsed.data.name.trim();

    if (await Trip.findOne({ name }).lean()) {
      throw app.httpErrors.conflict('a trip with this name already exists');
    }

    const shortId = await generateUniqueShortId(
      async (id) => (await Trip.exists({ shortId: id })) != null,
    );
    const doc = await Trip.create({ shortId, name });
    reply.code(201);
    return { trip: toTripDto(doc.toObject(), 0) };
  });

  app.delete<{ Params: { shortId: string } }>(
    '/api/trips/:shortId',
    mutate,
    async (req, reply) => {
      const trip = await Trip.findOne({ shortId: req.params.shortId }).lean();
      if (!trip) throw app.httpErrors.notFound('trip not found');

      const refs = await Post.find({ tripId: trip._id }, { shortId: 1, title: 1 }).lean();
      if (refs.length > 0) {
        reply.code(409);
        return {
          error: 'trip_in_use',
          posts: refs.map((p) => ({ id: p.shortId, title: p.title })),
        };
      }

      await Trip.deleteOne({ _id: trip._id });
      return reply.code(204).send();
    },
  );
}
