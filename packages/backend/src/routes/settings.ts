import type { FastifyInstance } from 'fastify';
import { updateSettingsRequestSchema } from '@stb/shared';
import { Settings, SETTINGS_ID } from '../db/models/Settings.js';
import { toSettingsDto, DEFAULT_SETTINGS } from '../dto.js';
import type { RouteContext } from './context.js';

/**
 * Site branding singleton: any editor may read (the admin UI shares this page
 * with the self-service "Passwort ändern" form), but only an admin may change
 * the blog branding.
 */
export function registerSettingsRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks } = ctx;

  app.get('/api/settings', { preHandler: hooks.requireAuth }, async () => {
    const settings = await Settings.findById(SETTINGS_ID).lean();
    return { settings: settings ? toSettingsDto(settings) : DEFAULT_SETTINGS };
  });

  app.put(
    '/api/settings',
    { preHandler: [hooks.requireAuth, hooks.requireCsrf, hooks.requireRole('admin')] },
    async (req) => {
      const parsed = updateSettingsRequestSchema.safeParse(req.body);
      if (!parsed.success) throw app.httpErrors.badRequest('invalid settings payload');

      const settings = await Settings.findByIdAndUpdate(
        SETTINGS_ID,
        { _id: SETTINGS_ID, ...parsed.data },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      ).lean();

      return { settings: toSettingsDto(settings!) };
    },
  );
}
