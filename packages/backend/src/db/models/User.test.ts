import { describe, it, expect } from 'vitest';
import { useTestDatabase } from '../../../tests/db.js';
import { User } from './User.js';

describe('User model', () => {
  useTestDatabase();

  it('lowercases and trims the username', async () => {
    const u = await User.create({
      username: '  Alice  ',
      passwordHash: 'h',
      role: 'editor',
    });
    expect(u.username).toBe('alice');
  });

  it('requires a role from the allowed enum', async () => {
    await expect(
      User.create({ username: 'bob', passwordHash: 'h', role: 'root' }),
    ).rejects.toThrow();
  });

  it('requires username and passwordHash', async () => {
    await expect(User.create({ role: 'admin' })).rejects.toThrow();
  });

  it('enforces a unique username index', async () => {
    await User.init(); // ensure indexes are built before asserting uniqueness
    await User.create({ username: 'carol', passwordHash: 'h', role: 'admin' });
    await expect(
      User.create({ username: 'Carol', passwordHash: 'h2', role: 'editor' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('stamps createdAt/updatedAt timestamps', async () => {
    const u = await User.create({
      username: 'dave',
      passwordHash: 'h',
      role: 'editor',
    });
    expect(u.createdAt).toBeInstanceOf(Date);
    expect(u.updatedAt).toBeInstanceOf(Date);
  });
});
