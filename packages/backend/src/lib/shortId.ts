import { customAlphabet } from 'nanoid';

/**
 * Opaque, URL-friendly short ids for posts and trips (e.g. `/p/a3kf2x`).
 * Alphabet excludes visually ambiguous characters (0/O, 1/l) so ids are easy
 * to read aloud and transcribe.
 */
export const SHORT_ID_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
export const SHORT_ID_LENGTH = 6;

const nano = customAlphabet(SHORT_ID_ALPHABET, SHORT_ID_LENGTH);

export function generateShortId(): string {
  return nano();
}

/**
 * Generate a short id that is not already taken. `exists` should resolve true
 * when an id is already in use (e.g. a Mongo lookup). Throws if no free id is
 * found within `maxAttempts` — at 32^6 ≈ 1e9 keyspace, repeated collisions
 * indicate a bug, not bad luck.
 */
export async function generateUniqueShortId(
  exists: (id: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = generateShortId();
    if (!(await exists(id))) return id;
  }
  throw new Error(
    `Could not generate a unique short id after ${maxAttempts} attempts`,
  );
}
