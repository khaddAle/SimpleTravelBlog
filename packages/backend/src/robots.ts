import type { FastifyInstance } from 'fastify';

const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';

/**
 * Keep the private family blog out of search engines (target-picture §11):
 * stamp every response with `X-Robots-Tag: noindex, nofollow` and serve a
 * disallow-all `/robots.txt`. The header is the authoritative signal (it also
 * covers assets and API responses); robots.txt is the belt-and-braces crawler
 * hint. Registered before the SPA fallback so the static wildcard never shadows
 * `/robots.txt`.
 */
export function registerRobots(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow');
  });

  app.get('/robots.txt', async (_req, reply) => {
    reply.type('text/plain');
    return ROBOTS_TXT;
  });
}
