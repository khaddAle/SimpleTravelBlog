import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { settings, DEFAULT_SETTINGS } from './settings.svelte.js';
import { api } from './api.js';

beforeEach(() => {
  settings.apply(DEFAULT_SETTINGS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings store', () => {
  it('defaults to Reiseblog branding', () => {
    expect(settings.siteTitle).toBe('Reiseblog');
    expect(settings.accentColor).toBe('#3477eb');
    expect(settings.logoKey).toBeUndefined();
  });

  it('load() applies public settings', async () => {
    vi.spyOn(api, 'publicSettings').mockResolvedValue({
      siteTitle: 'Unsere Reisen',
      accentColor: '#ff0000',
      logoKey: 'logos/x.webp',
    });
    await settings.load();
    expect(settings.siteTitle).toBe('Unsere Reisen');
    expect(settings.accentColor).toBe('#ff0000');
    expect(settings.logoKey).toBe('logos/x.webp');
  });

  it('save() persists and mirrors the response', async () => {
    const updated = { siteTitle: 'Neu', accentColor: '#00ff00' };
    const spy = vi.spyOn(api, 'updateSettings').mockResolvedValue(updated);
    await settings.save(updated);
    expect(spy).toHaveBeenCalledWith(updated);
    expect(settings.siteTitle).toBe('Neu');
    expect(settings.logoKey).toBeUndefined();
  });
});
