import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { imageListQuerySchema } from '@stb/shared';
import { Image } from '../db/models/Image.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { processImage } from '../images/pipeline.js';
import { toImageDto } from '../dto.js';
import {
  imageIdsInUse,
  postsReferencingImage,
  imageReferencedBySettings,
} from '../posts/references.js';
import { escapeRegex, type RouteContext } from './context.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function displayKeyFor(imageId: string): string {
  return `posts/${imageId}-display.webp`;
}
function thumbKeyFor(imageId: string): string {
  return `posts/${imageId}-thumb.webp`;
}

export function registerImageRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks, storage, progress, limiter } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

  // Ceiling on accepted-but-unprocessed uploads. Each holds its original buffer
  // until a pipeline slot frees, so this bounds the memory queued uploads pin.
  // Checked-and-incremented synchronously (no await between read and `++`), so
  // it is a firm ceiling, not a racy one.
  const maxBacklog = ctx.config.imageUploadMaxBacklog;
  let acceptedInFlight = 0;

  /** Background: transcode → store both variants → persist → emit done/error. */
  async function runPipeline(args: {
    uploadId: string;
    imageId: string;
    buffer: Buffer;
    filename: string;
    mime: string;
    uploaderId: string;
  }): Promise<void> {
    const { uploadId, imageId, buffer, filename, mime, uploaderId } = args;
    try {
      await progress.publish(uploadId, { type: 'progress', pct: 10 });
      const processed = await processImage(buffer);
      await progress.publish(uploadId, { type: 'progress', pct: 60 });

      const displayKey = displayKeyFor(imageId);
      const thumbKey = thumbKeyFor(imageId);
      await storage.putObject(displayKey, processed.display, 'image/webp');
      await storage.putObject(thumbKey, processed.thumb, 'image/webp');
      await progress.publish(uploadId, { type: 'progress', pct: 90 });

      const doc = await Image.create({
        shortId: imageId,
        originalFilename: filename,
        mime,
        displayKey,
        thumbKey,
        width: processed.width,
        height: processed.height,
        ...(processed.takenAt ? { takenAt: processed.takenAt } : {}),
        uploaderId,
      });
      await progress.publish(uploadId, {
        type: 'done',
        image: toImageDto(doc.toObject()),
      });
    } catch (err) {
      await progress.publish(uploadId, {
        type: 'error',
        message: err instanceof Error ? err.message : 'upload failed',
      });
    }
  }

  app.post('/api/images/upload', mutate, async (req, reply) => {
    const file = await req.file();
    if (!file) throw app.httpErrors.badRequest('no file uploaded');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw app.httpErrors.unsupportedMediaType(`unsupported type ${file.mimetype}`);
    }

    if (acceptedInFlight >= maxBacklog) {
      // Drain the multipart stream so the connection closes cleanly without
      // buffering the body we are about to reject.
      file.file.resume();
      reply.header('Retry-After', '2').code(429);
      return { error: 'too_many_uploads' };
    }
    acceptedInFlight++; // reserve synchronously, before the first await

    try {
      const buffer = await file.toBuffer();

      const imageId = await generateUniqueShortId(
        async (id) => (await Image.exists({ shortId: id })) != null,
      );
      const uploadId = randomUUID();
      await progress.create(uploadId);
      // Warm the progress TTL and drive a visible "queued" state before we wait
      // for a pipeline slot. Modeled as a plain progress event so it flows
      // through the existing SSE handler without a schema/guard change.
      await progress.publish(uploadId, { type: 'progress', pct: 0 });

      // Fire-and-forget behind the concurrency cap; the client tracks completion
      // over the SSE channel. Wrapping the whole pipeline bounds the buffer's
      // hold time to the slot, and runPipeline never rejects (internal
      // try/catch → SSE error event), so `.finally` reliably decrements.
      void limiter
        .run(() =>
          runPipeline({
            uploadId,
            imageId,
            buffer,
            filename: file.filename,
            mime: file.mimetype,
            uploaderId: req.authUser!.id,
          }),
        )
        .finally(() => {
          acceptedInFlight--;
        });

      reply.code(202);
      return { uploadId, imageId };
    } catch (err) {
      acceptedInFlight--; // release on a pre-run failure (e.g. toBuffer size limit)
      throw err;
    }
  });

  app.get<{ Params: { uploadId: string } }>(
    '/api/images/upload/:uploadId/progress',
    auth,
    async (req, reply) => {
      const { uploadId } = req.params;
      if (!(await progress.has(uploadId))) {
        throw app.httpErrors.notFound('unknown upload');
      }

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const off = await progress.subscribe(uploadId, (event) => {
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (event.type !== 'progress') raw.end();
      });
      req.raw.on('close', off);
    },
  );

  app.get('/api/images', auth, async (req) => {
    const parsed = imageListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid query');
    const { page, pageSize, q, orphansOnly, sort, excludePostId } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (q) filter.originalFilename = { $regex: escapeRegex(q), $options: 'i' };
    if (orphansOnly) {
      const used = await imageIdsInUse(excludePostId);
      filter.shortId = { $nin: [...used] };
    }

    // Capture-date sorts run through an aggregation so images without a takenAt
    // always sort behind the dated ones — in BOTH directions (a plain `.sort`
    // would scatter the nulls to one end depending on direction). The three
    // legacy modes keep the simpler find().sort() path.
    if (sort === 'taken-newest' || sort === 'taken-oldest') {
      const dir = sort === 'taken-oldest' ? 1 : -1;
      const [total, images] = await Promise.all([
        Image.countDocuments(filter),
        Image.aggregate([
          { $match: filter },
          { $addFields: { _missing: { $cond: [{ $ifNull: ['$takenAt', false] }, 0, 1] } } },
          // Present dates first; createdAt is the tiebreak (and orders the undated tail).
          { $sort: { _missing: 1, takenAt: dir, createdAt: -1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
        ]),
      ]);
      return { images: images.map(toImageDto), page, pageSize, total };
    }

    const sortSpec =
      sort === 'oldest'
        ? { createdAt: 1 as const }
        : sort === 'filename'
          ? { originalFilename: 1 as const }
          : { createdAt: -1 as const };

    const [total, images] = await Promise.all([
      Image.countDocuments(filter),
      Image.find(filter)
        .sort(sortSpec)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    return { images: images.map(toImageDto), page, pageSize, total };
  });

  /** How many images are currently unused — drives the bulk-delete confirm. */
  app.get('/api/images/unused/count', auth, async () => {
    const used = await imageIdsInUse();
    const count = await Image.countDocuments({ shortId: { $nin: [...used] } });
    return { count };
  });

  /**
   * Delete every unused image in one call. The unused set is recomputed here
   * (not taken from a prior count) so it stays authoritative even if posts
   * changed since the confirm dialog was shown. Storage objects are removed
   * before the DB record, matching the single-delete path; a partial failure
   * is safely idempotent on re-run.
   */
  app.post('/api/images/unused/delete', mutate, async () => {
    const used = await imageIdsInUse();
    const unused = await Image.find({ shortId: { $nin: [...used] } }).lean();
    let deleted = 0;
    for (const image of unused) {
      await storage.deleteObject(image.displayKey);
      await storage.deleteObject(image.thumbKey);
      await Image.deleteOne({ _id: image._id });
      deleted += 1;
    }
    return { deleted };
  });

  app.get<{ Params: { shortId: string } }>(
    '/api/images/:shortId/usage',
    auth,
    async (req) => {
      const image = await Image.findOne({ shortId: req.params.shortId }).lean();
      if (!image) throw app.httpErrors.notFound('image not found');
      return { posts: await postsReferencingImage(req.params.shortId) };
    },
  );

  app.delete<{ Params: { shortId: string } }>(
    '/api/images/:shortId',
    mutate,
    async (req, reply) => {
      const image = await Image.findOne({ shortId: req.params.shortId }).lean();
      if (!image) throw app.httpErrors.notFound('image not found');

      const refs = await postsReferencingImage(req.params.shortId);
      const inSettings = await imageReferencedBySettings(req.params.shortId);
      if (refs.length > 0 || inSettings) {
        reply.code(409);
        return { error: 'image_in_use', posts: refs };
      }

      await storage.deleteObject(image.displayKey);
      await storage.deleteObject(image.thumbKey);
      await Image.deleteOne({ _id: image._id });
      return reply.code(204).send();
    },
  );
}
