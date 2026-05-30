import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { imageListQuerySchema } from '@stb/shared';
import { Image } from '../db/models/Image.js';
import { generateUniqueShortId } from '../lib/shortId.js';
import { processImage } from '../images/pipeline.js';
import { toImageDto } from '../dto.js';
import { imageIdsInUse, postsReferencingImage } from '../posts/references.js';
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
  const { hooks, storage, progress } = ctx;
  const auth = { preHandler: hooks.requireAuth };
  const mutate = { preHandler: [hooks.requireAuth, hooks.requireCsrf] };

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
    const buffer = await file.toBuffer();

    const imageId = await generateUniqueShortId(
      async (id) => (await Image.exists({ shortId: id })) != null,
    );
    const uploadId = randomUUID();
    await progress.create(uploadId);

    // Fire-and-forget; the client tracks completion over the SSE channel.
    void runPipeline({
      uploadId,
      imageId,
      buffer,
      filename: file.filename,
      mime: file.mimetype,
      uploaderId: req.authUser!.id,
    });

    reply.code(202);
    return { uploadId, imageId };
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
    const { page, pageSize, q, orphansOnly, sort } = parsed.data;

    const filter: Record<string, unknown> = {};
    if (q) filter.originalFilename = { $regex: escapeRegex(q), $options: 'i' };
    if (orphansOnly) {
      const used = await imageIdsInUse();
      filter.shortId = { $nin: [...used] };
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
      if (refs.length > 0) {
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
