import type { FastifyInstance } from 'fastify';
import { createTripRequestSchema, updateTripRequestSchema } from '@stb/shared';
import { Trip } from '../db/models/Trip.js';
import { Post } from '../db/models/Post.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toTripDto } from '../dto.js';
import type { RouteContext } from './context.js';

/** Mongo duplicate-key (E11000) — raised when a unique index (here `name`) collides. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as Record<string, unknown>).code === 11000
  );
}

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

  app.patch<{ Params: { shortId: string } }>(
    '/api/trips/:shortId',
    mutate,
    async (req) => {
      const parsed = updateTripRequestSchema.safeParse(req.body);
      if (!parsed.success) throw app.httpErrors.badRequest('invalid trip payload');
      const name = parsed.data.name.trim();

      const trip = await Trip.findOne({ shortId: req.params.shortId });
      if (!trip) throw app.httpErrors.notFound('trip not found');

      // Reject a clash with a DIFFERENT trip (renaming to the same name is a no-op).
      const clash = await Trip.findOne({ name, shortId: { $ne: trip.shortId } }).lean();
      if (clash) throw app.httpErrors.conflict('a trip with this name already exists');

      // Rename only — the shortId is what search filters, archive grouping and
      // shared links key on, so it must stay stable.
      trip.name = name;
      try {
        await trip.save();
      } catch (err) {
        // Lost a race against a concurrent rename to the same name (unique index).
        if (isDuplicateKeyError(err)) {
          throw app.httpErrors.conflict('a trip with this name already exists');
        }
        throw err;
      }

      const count = await Post.countDocuments({ tripId: trip._id });
      return { trip: toTripDto(trip.toObject(), count) };
    },
  );

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
