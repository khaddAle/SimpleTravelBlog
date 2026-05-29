import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE_NAME = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit CSRF. A random token is stored in the session (`csrfSecret`) and
 * mirrored into a readable `csrf` cookie. Clients echo it back in the
 * `X-CSRF-Token` header on mutations; the server compares the header to the
 * session value in constant time. An attacker on another origin cannot read the
 * cookie (SameSite=Lax on the session) nor set the custom header cross-site.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function verifyCsrfToken(expected: string, provided: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
