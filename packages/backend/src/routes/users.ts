import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { createUserRequestSchema, updateUserRequestSchema } from '@stb/shared';
import { User } from '../db/models/User.js';
import { hashPassword } from '../auth/hash.js';
import { toUserListItem } from '../dto.js';
import type { RouteContext } from './context.js';

/** Admin-only user management. Editors cannot reach any of these. */
export function registerUserRoutes(app: FastifyInstance, ctx: RouteContext): void {
  const { hooks } = ctx;
  const adminRead = { preHandler: [hooks.requireAuth, hooks.requireRole('admin')] };
  const adminWrite = {
    preHandler: [hooks.requireAuth, hooks.requireCsrf, hooks.requireRole('admin')],
  };

  app.get('/api/users', adminRead, async () => {
    const users = await User.find().sort({ username: 1 }).lean();
    return { users: users.map(toUserListItem) };
  });

  app.post('/api/users', adminWrite, async (req, reply) => {
    const parsed = createUserRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid user payload');
    const username = parsed.data.username.toLowerCase().trim();

    if (await User.findOne({ username }).lean()) {
      throw app.httpErrors.conflict('username already taken');
    }

    const doc = await User.create({
      username,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    });
    reply.code(201);
    return { user: toUserListItem(doc.toObject()) };
  });

  app.patch<{ Params: { id: string } }>('/api/users/:id', adminWrite, async (req) => {
    const parsed = updateUserRequestSchema.safeParse(req.body);
    if (!parsed.success) throw app.httpErrors.badRequest('invalid user payload');
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw app.httpErrors.notFound('user not found');
    }

    const user = await User.findById(req.params.id);
    if (!user) throw app.httpErrors.notFound('user not found');

    const data = parsed.data;
    if (data.password !== undefined) user.passwordHash = await hashPassword(data.password);
    if (data.role !== undefined) user.role = data.role;
    if (data.deactivated !== undefined) {
      user.deactivatedAt = data.deactivated ? new Date() : null;
    }

    await user.save();
    return { user: toUserListItem(user.toObject()) };
  });
}
