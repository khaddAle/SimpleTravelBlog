import cookieSignature from 'cookie-signature';
import type { CookieSerializeOptions } from '@fastify/cookie';

export const SESSION_COOKIE_NAME = 'sid';

/** Sign a session id for use as a cookie value (tamper-evident). */
export function signSessionId(sid: string, secret: string): string {
  return cookieSignature.sign(sid, secret);
}

/** Recover a session id from a signed cookie value, or null if tampered. */
export function unsignSessionId(signed: string, secret: string): string | null {
  const value = cookieSignature.unsign(signed, secret);
  return value === false ? null : value;
}

/**
 * Cookie attributes for the session id. HttpOnly (no JS access), Secure outside
 * dev, SameSite=Lax (sent on top-level navigations, blocks CSRF on cross-site
 * subrequests).
 */
export function sessionCookieOptions(opts: {
  maxAgeSeconds: number;
  secure: boolean;
}): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: opts.maxAgeSeconds,
  };
}

/** Options to clear the session cookie. */
export function clearSessionCookieOptions(secure: boolean): CookieSerializeOptions {
  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 };
}
