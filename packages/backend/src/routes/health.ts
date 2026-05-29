import type { FastifyInstance } from 'fastify';

/** Liveness/readiness endpoints. `/healthz` backs the container HEALTHCHECK. */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));
}
