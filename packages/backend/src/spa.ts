import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serve the built single-page app from `root`. Real files (index.html, hashed
 * assets) are streamed by `@fastify/static`; every other GET that is not an API
 * call falls back to `index.html` so the client-side (hash) router can take over.
 * API paths and non-GET requests keep returning JSON 404s.
 *
 * Registered last in {@link buildApp} so its wildcard route never shadows the
 * concrete API routes. The first admin and SPA are the only "real serving"
 * concerns the production entrypoint adds on top of the test-built app.
 */
export async function registerSpaStatic(
  app: FastifyInstance,
  opts: { root: string },
): Promise<void> {
  await app.register(fastifyStatic, { root: opts.root });

  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });
}
