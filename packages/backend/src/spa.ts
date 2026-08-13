import { basename } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Hashed bundles never change content for a given name → cache them forever. */
const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** The app shell must be revalidated every load so deploys take effect at once. */
const SHELL_CACHE_CONTROL = 'no-cache';

/**
 * Serve the built single-page app from `root`. Real files (index.html, hashed
 * assets) are streamed by `@fastify/static`; every other GET that is not an API
 * call falls back to `index.html` so the client-side (hash) router can take over.
 * API paths and non-GET requests keep returning JSON 404s.
 *
 * Cache headers are set per file class (`cacheControl: false` disables the
 * library's blanket `max-age=0` so our `setHeaders` value is authoritative):
 * `index.html` — the app shell — is `no-cache` so the browser (and Cloudflare,
 * under "Respect Existing Headers") always revalidates it; a stale shell points
 * at content-hashed bundles a later deploy has deleted, so the module script
 * 404s and the app never mounts (blank page). Everything else Vite emits is
 * content-hashed under `assets/`, so it is safe to cache immutably and forever.
 * ETag/Last-Modified stay on (defaults), so `no-cache` revalidations return 304.
 *
 * Registered last in {@link buildApp} so its wildcard route never shadows the
 * concrete API routes. The first admin and SPA are the only "real serving"
 * concerns the production entrypoint adds on top of the test-built app.
 */
export async function registerSpaStatic(
  app: FastifyInstance,
  opts: { root: string },
): Promise<void> {
  await app.register(fastifyStatic, {
    root: opts.root,
    // We set Cache-Control ourselves per file class; let the library set ETag
    // and Last-Modified (its defaults) for conditional revalidation.
    cacheControl: false,
    // Runs for direct file serves AND the `reply.sendFile` fallback below.
    // @fastify/static v10 hands this a FastifyReply, not a Node response, so
    // headers go through `reply.header()` rather than `res.setHeader()`.
    setHeaders(reply, filePath) {
      const header =
        basename(filePath) === 'index.html' ? SHELL_CACHE_CONTROL : ASSET_CACHE_CONTROL;
      reply.header('Cache-Control', header);
    },
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });
}
