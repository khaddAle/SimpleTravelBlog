import type { FastifyInstance } from 'fastify';
import { Track } from '../db/models/Track.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toTrackDto } from '../dto.js';
import { GpxError } from '../tracks/gpx.js';
import { processGpx, type ProcessedTrack } from '../tracks/process.js';
import type { RouteContext } from './context.js';

function gpxKeyFor(trackId: string): string {
  return `tracks/${trackId}.gpx`;
}

export function registerTrackRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks, storage } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

  /**
   * Upload a GPX track. Synchronous: parsing + thinning a long track takes well
   * under a second, so there is no pipeline/SSE like for images. Browsers send
   * .gpx with varying mime types, so the extension decides.
   */
  app.post('/api/tracks/upload', mutate, async (req, reply) => {
    const file = await req.file();
    if (!file) throw app.httpErrors.badRequest('no file uploaded');
    if (!/\.gpx$/i.test(file.filename)) {
      throw app.httpErrors.unsupportedMediaType('Nur .gpx-Dateien werden unterstützt');
    }
    const buffer = await file.toBuffer();

    let processed: ProcessedTrack;
    try {
      processed = processGpx(buffer);
    } catch (err) {
      if (err instanceof GpxError) throw app.httpErrors.badRequest(err.message);
      throw err;
    }

    const trackId = await generateUniqueShortId(
      async (id) => (await Track.exists({ shortId: id })) != null,
    );
    const gpxKey = gpxKeyFor(trackId);
    await storage.putObject(gpxKey, buffer, 'application/gpx+xml');
    const doc = await Track.create({
      shortId: trackId,
      originalFilename: file.filename,
      ...processed,
      gpxKey,
      uploaderId: req.authUser!.id,
    });
    reply.code(201);
    return toTrackDto(doc.toObject());
  });

  app.get<{ Params: { shortId: string } }>('/api/tracks/:shortId', auth, async (req) => {
    const track = await Track.findOne({ shortId: req.params.shortId }, { points: 0 }).lean();
    if (!track) throw app.httpErrors.notFound('track not found');
    return toTrackDto(track);
  });

  app.delete<{ Params: { shortId: string } }>(
    '/api/tracks/:shortId',
    mutate,
    async (req, reply) => {
      const track = await Track.findOne({ shortId: req.params.shortId }, { gpxKey: 1 }).lean();
      if (!track) throw app.httpErrors.notFound('track not found');
      await storage.deleteObject(track.gpxKey);
      await Track.deleteOne({ _id: track._id });
      return reply.code(204).send();
    },
  );
}
