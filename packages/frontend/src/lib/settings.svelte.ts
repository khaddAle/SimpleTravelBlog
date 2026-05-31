import type { SettingsDto } from '@stb/shared';
import { api } from './api.js';

/** Fallback branding before any settings have been loaded (mirrors backend). */
export const DEFAULT_SETTINGS: SettingsDto = {
  siteTitle: 'Reiseblog',
  accentColor: '#3f6699',
};

/**
 * Reactive site-branding store. `App.svelte` runs an `$effect` that mirrors
 * `accentColor` onto the `--accent` CSS custom property, so changing it here
 * restyles the whole app. Kept free of effects itself to stay unit-testable.
 */
class SettingsStore {
  siteTitle = $state(DEFAULT_SETTINGS.siteTitle);
  accentColor = $state(DEFAULT_SETTINGS.accentColor);
  logoKey = $state<string | undefined>(undefined);

  apply(settings: SettingsDto): void {
    this.siteTitle = settings.siteTitle;
    this.accentColor = settings.accentColor;
    this.logoKey = settings.logoKey;
  }

  async load(): Promise<void> {
    this.apply(await api.publicSettings());
  }

  async save(settings: SettingsDto): Promise<void> {
    this.apply(await api.updateSettings(settings));
  }
}

export const settings = new SettingsStore();
