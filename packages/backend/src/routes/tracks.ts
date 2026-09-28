import type { FastifyInstance } from 'fastify';
import { trackPreviewRequestSchema } from '@stb/shared';
import { Track } from '../db/models/Track.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { toTrackDto } from '../dto.js';
import { postsReferencingTrack } from '../posts/references.js';
import { GpxError } from '../tracks/gpx.js';
import { loadPlacement } from '../tracks/placement.js';
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

  /**
   * Editor preview: where the post's photos land for the given tracks and
   * offset, plus the suggested offset. Same code path as the public route.
   */
  app.post('/api/tracks/preview', mutate, async (req) => {
    const parsed = trackPreviewRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid preview request');
    const { tracks, utcOffsetMinutes, imageIds } = parsed.data;
    const placement = await loadPlacement({ refs: tracks, utcOffsetMinutes, imageIds });
    if (!placement.suggestion) throw app.httpErrors.badRequest('unknown trackId');
    return {
      suggestion: placement.suggestion,
      utcOffsetMinutes: placement.utcOffsetMinutes,
      photos: placement.photos,
    };
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
      const refs = await postsReferencingTrack(req.params.shortId);
      if (refs.length > 0) {
        reply.code(409);
        return { error: 'track_in_use', posts: refs };
      }
      await storage.deleteObject(track.gpxKey);
      await Track.deleteOne({ _id: track._id });
      return reply.code(204).send();
    },
  );
}
