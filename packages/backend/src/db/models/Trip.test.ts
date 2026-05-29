import { describe, it, expect } from 'vitest';
import { useTestDatabase } from '../../../tests/db.js';
import { Trip } from './Trip.js';

describe('Trip model', () => {
  useTestDatabase();

  it('creates a trip with a name and shortId', async () => {
    const t = await Trip.create({ shortId: 'abc123', name: 'Alpen 2026' });
    expect(t.name).toBe('Alpen 2026');
    expect(t.createdAt).toBeInstanceOf(Date);
  });

  it('enforces a unique name', async () => {
    await Trip.init();
    await Trip.create({ shortId: 'abc123', name: 'Alpen 2026' });
    await expect(
      Trip.create({ shortId: 'def456', name: 'Alpen 2026' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('enforces a unique shortId', async () => {
    await Trip.init();
    await Trip.create({ shortId: 'abc123', name: 'Alpen 2026' });
    await expect(
      Trip.create({ shortId: 'abc123', name: 'Norwegen 2025' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('rejects an empty name', async () => {
    await expect(Trip.create({ shortId: 'x', name: '' })).rejects.toThrow();
  });
});
