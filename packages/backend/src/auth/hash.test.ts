import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './hash.js';

describe('password hashing', () => {
  it('produces an argon2id hash that differs from the input', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse battery');
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(await verifyPassword(hash, 's3cret-pass')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('s3cret-pass');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('returns false (no throw) for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });

  it('salts: two hashes of the same password differ', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});
