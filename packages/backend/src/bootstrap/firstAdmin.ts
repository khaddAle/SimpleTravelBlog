import { User } from '../db/models/User.js';
import { hashPassword } from '../auth/hash.js';
import type { Config } from '../config.js';

/** Minimal logger surface so the entrypoint can pass `app.log` (pino). */
export interface BootstrapLogger {
  info: (msg: string) => void;
}

/** True for a Mongo duplicate-key error (E11000) however it is surfaced. */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

/**
 * Create the first admin from the `ADMIN_BOOTSTRAP_*` env, but only when the
 * user collection is empty. Safe to run on every boot: it no-ops once any user
 * exists, and treats a concurrent-boot duplicate-key race as "already done".
 * No-ops entirely when the bootstrap env vars are absent.
 *
 * @returns the (lowercased) username it created, or null if nothing was created.
 */
export async function ensureFirstAdmin(
  config: Config,
  logger?: BootstrapLogger,
): Promise<string | null> {
  if (!config.adminBootstrap) return null;

  if ((await User.countDocuments()) > 0) return null;

  const username = config.adminBootstrap.username.toLowerCase();
  try {
    await User.create({
      username,
      passwordHash: await hashPassword(config.adminBootstrap.password),
      role: 'admin',
    });
  } catch (err) {
    // Another replica raced us to the unique username — that's fine.
    if (isDuplicateKeyError(err)) return null;
    throw err;
  }

  logger?.info(`Bootstrapped first admin user "${username}"`);
  return username;
}
