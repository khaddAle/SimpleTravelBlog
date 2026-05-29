import argon2 from 'argon2';

/** Hash a plaintext password with argon2id (argon2's recommended variant). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/**
 * Verify a password against a stored hash. Returns false (never throws) on a
 * malformed/foreign hash, so callers can treat any failure uniformly.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
