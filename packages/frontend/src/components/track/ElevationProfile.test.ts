import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { buildTrackModel } from '../../lib/track/model.js';
import ElevationProfile from './ElevationProfile.svelte';
import { twoTracks } from '../../../tests/trackData.js';

// Pretend the layout gave the profile 400 px: a ResizeObserver that reports
// once on observe, and a fixed clientWidth.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element): void {
        this.cb([{ target: el } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ElevationProfile', () => {
  it('draws one area per track with German height and km labels', async () => {
    const { container } = render(ElevationProfile, { model: buildTrackModel(twoTracks()) });
    await waitFor(() => expect(container.querySelectorAll('path')).toHaveLength(2));
    const paths = [...container.querySelectorAll('path')];
    expect(paths.map((p) => p.getAttribute('fill'))).toEqual(['#3f6699', '#c0612b']);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(['1.000 m', '1.100 m', '1.200 m', '1 km', '2 km']);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 400 104');
  });
});
