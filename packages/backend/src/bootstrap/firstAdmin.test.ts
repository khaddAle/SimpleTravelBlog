import { describe, it, expect, beforeEach } from 'vitest';
import { useTestDatabase } from '../../tests/db.js';
import { loadConfig } from '../config.js';
import { User } from '../db/models/User.js';
import { hashPassword, verifyPassword } from '../auth/hash.js';
import { ensureFirstAdmin } from './firstAdmin.js';

const baseEnv = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://placeholder/test',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'travel-blog-images-test',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  SESSION_COOKIE_SECRET: 'x'.repeat(32),
  CSRF_COOKIE_SECRET: 'y'.repeat(32),
} as const;

const withAdmin = (username: string, password: string) =>
  loadConfig({
    ...baseEnv,
    ADMIN_BOOTSTRAP_USERNAME: username,
    ADMIN_BOOTSTRAP_PASSWORD: password,
  });

describe('ensureFirstAdmin', () => {
  useTestDatabase();

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('no-ops (returns null) when no bootstrap env is configured', async () => {
    const created = await ensureFirstAdmin(loadConfig(baseEnv));
    expect(created).toBeNull();
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates the first admin when the user collection is empty', async () => {
    const created = await ensureFirstAdmin(withAdmin('TB-Admin', 's3cret-pw-123'));
    expect(created).toBe('tb-admin');

    const user = await User.findOne({ username: 'tb-admin' });
    expect(user).not.toBeNull();
    expect(user?.role).toBe('admin');
    expect(await verifyPassword(user!.passwordHash, 's3cret-pw-123')).toBe(true);
  });

  it('does nothing when any user already exists', async () => {
    await User.create({
      username: 'someone',
      passwordHash: await hashPassword('whatever-123'),
      role: 'editor',
    });

    const created = await ensureFirstAdmin(withAdmin('tb-admin', 's3cret-pw-123'));
    expect(created).toBeNull();
    expect(await User.countDocuments()).toBe(1);
    expect(await User.findOne({ username: 'tb-admin' })).toBeNull();
  });

  it('is idempotent across repeated boots', async () => {
    const cfg = withAdmin('tb-admin', 's3cret-pw-123');
    const first = await ensureFirstAdmin(cfg);
    const second = await ensureFirstAdmin(cfg);
    expect(first).toBe('tb-admin');
    expect(second).toBeNull();
    expect(await User.countDocuments({ username: 'tb-admin' })).toBe(1);
  });
});
