import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
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

  it('reports pointer input as a distance along the profile', async () => {
    const onpointer = vi.fn();
    const { container } = render(ElevationProfile, {
      model: buildTrackModel(twoTracks()),
      onpointer,
    });
    const svg = container.querySelector('svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      width: 400,
    } as DOMRect);
    await fireEvent.pointerDown(svg, { clientX: 300, pointerType: 'mouse' });
    await fireEvent.pointerMove(svg, { clientX: 700 });
    await fireEvent.pointerLeave(svg);
    // The longer track (2.5 km) spans the full width; outside it clamps.
    expect(onpointer.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['down', 1250],
      ['move', 2500],
      ['leave', 0],
    ]);
  });

  it('draws the overlay of an interactive profile', async () => {
    const { container } = render(ElevationProfile, {
      model: buildTrackModel(twoTracks()),
      cursor: { d: 1250, dots: [{ d: 1250, ele: 1100, color: '#3f6699', out: false }] },
    });
    await waitFor(() => expect(container.querySelector('line.cursor')).not.toBeNull());
    expect(container.querySelector('line.cursor')!.getAttribute('x1')).toBe('200');
    expect(container.querySelectorAll('circle.dot')).toHaveLength(1);
  });
});
