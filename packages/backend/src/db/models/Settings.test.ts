import { describe, it, expect } from 'vitest';
import { useTestDatabase } from '../../../tests/db.js';
import { Settings, SETTINGS_ID } from './Settings.js';

describe('Settings model', () => {
  useTestDatabase();

  it('defaults the _id to the singleton id', async () => {
    const s = await Settings.create({ siteTitle: 'Reiseblog', accentColor: '#2b6cb0' });
    expect(s._id).toBe(SETTINGS_ID);
  });

  it('rejects a non-hex accent color', async () => {
    await expect(
      Settings.create({ siteTitle: 'Reiseblog', accentColor: 'blau' }),
    ).rejects.toThrow();
  });

  it('requires a site title', async () => {
    await expect(Settings.create({ accentColor: '#000000' })).rejects.toThrow();
  });

  it('upserts the singleton rather than creating a second row', async () => {
    await Settings.create({ siteTitle: 'Erster', accentColor: '#111111' });
    await Settings.updateOne(
      { _id: SETTINGS_ID },
      { siteTitle: 'Zweiter', accentColor: '#222222' },
      { upsert: true },
    );
    const all = await Settings.find();
    expect(all).toHaveLength(1);
    expect(all[0]?.siteTitle).toBe('Zweiter');
  });
});
