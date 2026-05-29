import { describe, it, expect } from 'vitest';
import {
  signSessionId,
  unsignSessionId,
  sessionCookieOptions,
  clearSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from './sessionCookie.js';

const secret = 'a'.repeat(32);

describe('session cookie signing', () => {
  it('round-trips a signed session id', () => {
    const signed = signSessionId('sid-123', secret);
    expect(signed).not.toBe('sid-123');
    expect(unsignSessionId(signed, secret)).toBe('sid-123');
  });

  it('rejects a tampered value', () => {
    const signed = signSessionId('sid-123', secret);
    expect(unsignSessionId(signed + 'x', secret)).toBeNull();
  });

  it('rejects a value signed with a different secret', () => {
    const signed = signSessionId('sid-123', secret);
    expect(unsignSessionId(signed, 'b'.repeat(32))).toBeNull();
  });

  it('uses the canonical cookie name', () => {
    expect(SESSION_COOKIE_NAME).toBe('sid');
  });
});

describe('session cookie options', () => {
  it('is HttpOnly + SameSite=Lax with the given maxAge', () => {
    const opts = sessionCookieOptions({ maxAgeSeconds: 1000, secure: true });
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000,
    });
  });

  it('can be insecure for local dev', () => {
    expect(sessionCookieOptions({ maxAgeSeconds: 1, secure: false }).secure).toBe(false);
  });

  it('clear options expire the cookie immediately', () => {
    expect(clearSessionCookieOptions(true).maxAge).toBe(0);
  });
});
