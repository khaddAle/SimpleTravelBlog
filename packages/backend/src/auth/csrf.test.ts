import { describe, it, expect } from 'vitest';
import { generateCsrfToken, verifyCsrfToken } from './csrf.js';

describe('CSRF tokens', () => {
  it('generates a url-safe token', () => {
    const t = generateCsrfToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
  });

  it('generates unique tokens', () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });

  it('verifies a matching token', () => {
    const t = generateCsrfToken();
    expect(verifyCsrfToken(t, t)).toBe(true);
  });

  it('rejects a mismatched token', () => {
    expect(verifyCsrfToken(generateCsrfToken(), generateCsrfToken())).toBe(false);
  });

  it('rejects when the header is missing', () => {
    expect(verifyCsrfToken(generateCsrfToken(), undefined)).toBe(false);
  });

  it('rejects when the expected value is empty', () => {
    expect(verifyCsrfToken('', 'anything')).toBe(false);
  });

  it('rejects tokens of differing length without throwing', () => {
    expect(verifyCsrfToken('short', 'a-much-longer-token-value')).toBe(false);
  });
});
