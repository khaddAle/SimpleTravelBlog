import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import L from 'leaflet';
import type { PublicTrackData } from '@stb/shared';
import { buildTrackModel } from '../../lib/track/model.js';
import TrackDialog from './TrackDialog.svelte';
import { oneTrack, T0, twoTracks } from '../../../tests/trackData.js';

vi.mock('leaflet', () => {
  const map = {
    fitBounds: vi.fn().mockReturnThis(),
    removeLayer: vi.fn().mockReturnThis(),
    invalidateSize: vi.fn().mockReturnThis(),
    panTo: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    getBounds: vi.fn(() => ({ pad: () => ({ contains: () => true }) })),
    latLngToContainerPoint: vi.fn(() => ({ x: 100, y: 100 })),
    remove: vi.fn(),
    attributionControl: { setPrefix: vi.fn() },
  };
  const layer = () => ({
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    clearLayers: vi.fn().mockReturnThis(),
    setLatLng: vi.fn().mockReturnThis(),
    getElement: vi.fn(() => undefined),
    remove: vi.fn(),
  });
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(layer),
      layerGroup: vi.fn(layer),
      polyline: vi.fn(layer),
      circleMarker: vi.fn(layer),
      marker: vi.fn(layer),
      divIcon: vi.fn((o: object) => o),
    },
  };
});

type MockFn = ReturnType<typeof vi.fn>;
type Clickable = { on: MockFn };

// Frames are driven by hand: the dialog's requestAnimationFrame callbacks queue up here.
let frames: FrameRequestCallback[] = [];
function runFrame(now: number): void {
  const due = frames;
  frames = [];
  flushSync(() => {
    for (const cb of due) cb(now);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
  // A laid-out dialog: measured sizes reach the profile and the photo card.
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
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open(data: PublicTrackData = twoTracks(), onClose = vi.fn()) {
  const r = render(TrackDialog, {
    model: buildTrackModel(data),
    title: 'Über den Pass',
    images: { img1: { width: 400, height: 300 } },
    onClose,
  });
  return { ...r, onClose };
}
const clock = (): string => document.querySelector('.tm-clock')!.textContent ?? '';
const markerCalls = () => (L.marker as unknown as MockFn).mock.results.map((r) => r.value as Clickable);
const clickHandler = (m: Clickable): (() => void) =>
  m.on.mock.calls.find((c) => c[0] === 'click')![1] as () => void;

describe('TrackDialog', () => {
  it('opens as a modal with the post title, focus on close and the page locked', () => {
    const { unmount } = open();
    expect(screen.getByRole('dialog', { name: 'GPS-Track' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Über den Pass')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('draws an interactive map and fits it again after layout', () => {
    open();
    expect((L.map as unknown as MockFn).mock.calls[0]![1]).not.toMatchObject({ dragging: false });
    const map = (L.map as unknown as MockFn).mock.results[0]!.value as { invalidateSize: MockFn; fitBounds: MockFn };
    expect(L.marker).toHaveBeenCalledTimes(2); // one dot per person
    const fits = map.fitBounds.mock.calls.length;
    runFrame(16);
    expect(map.invalidateSize).toHaveBeenCalled();
    expect(map.fitBounds.mock.calls.length).toBe(fits + 1);
  });

  it('closes with Escape and the close button', async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('starts at the first start time and shows where each person is', () => {
    open();
    expect(clock()).toContain('10:00:00');
    expect(clock()).toContain('Sa, 12.09.');
    expect(clock()).toContain('UTC+2');
    const readout = document.querySelector('.tm-readout')!.textContent!;
    expect(readout).toContain('Anna');
    // Ben starts 10 min later.
    expect(readout).toContain('noch nicht gestartet');
  });

  it('offers the follow toggle only with two tracks', async () => {
    const user = userEvent.setup();
    open();
    const ben = screen.getByRole('button', { name: 'Ben' });
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(ben);
    expect(ben).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no follow toggle with one track', () => {
    open(oneTrack());
    expect(screen.queryByRole('button', { name: 'Anna' })).toBeNull();
  });

  it('plays at the chosen speed and pauses', async () => {
    const user = userEvent.setup();
    open();
    const speed = screen.getByRole('combobox', { name: 'Geschwindigkeit' });
    expect(speed).toHaveValue('60');
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    runFrame(100);
    expect(clock()).toContain('10:00:06');
    await user.selectOptions(speed, '600');
    runFrame(200);
    expect(clock()).toContain('10:01:06');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    runFrame(300);
    expect(clock()).toContain('10:01:06');
  });

  it('toggles play with the space bar', async () => {
    open();
    await fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('seeks with the scrubber', async () => {
    open();
    await fireEvent.input(screen.getByRole('slider', { name: 'Zeitpunkt' }), {
      target: { value: '500' },
    });
    expect(clock()).toContain('10:40:00');
  });

  it('hover on the profile shows that spot; a click seeks there', async () => {
    const { container } = open();
    const svg = container.querySelector('svg.profile')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 2500 } as DOMRect);
    // Anna reaches 1112 m after 30 min.
    await fireEvent.pointerMove(svg, { clientX: 1112, pointerType: 'mouse' });
    const readout = document.querySelector('.tm-readout')!.textContent!;
    expect(readout).toContain('10:30');
    expect(readout).toContain('Klick setzt die Wiedergabe hierher');
    expect(clock()).toContain('10:00:00');
    await fireEvent.pointerDown(svg, { clientX: 1112, pointerType: 'mouse' });
    await fireEvent.pointerUp(svg, { clientX: 1112, pointerType: 'mouse' });
    expect(clock()).toContain('10:30:00');
  });

  it('shows the photos on request and opens one when the replay reaches it', async () => {
    const user = userEvent.setup();
    open();
    const btn = screen.getByRole('button', { name: 'Fotos einblenden' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(L.marker).toHaveBeenCalledTimes(3); // + the photo spot

    // Just before the photo at 10:30, then fast forward.
    await fireEvent.input(screen.getByRole('slider', { name: 'Zeitpunkt' }), {
      target: { value: '373' },
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Geschwindigkeit' }), '600');
    await user.click(screen.getByRole('button', { name: 'Abspielen' }));
    runFrame(100);
    runFrame(150);
    await waitFor(() => expect(document.querySelector('.tm-card img')).not.toBeNull());
    expect(document.querySelector('.tm-card img')!.getAttribute('src')).toContain('/img1/display');
    expect(document.querySelector('.tm-card .hold')).not.toBeNull();
    expect(document.querySelector('.tm-card')!.textContent).toContain('10:30');

    await user.click(screen.getByRole('button', { name: 'Foto schließen' }));
    expect(document.querySelector('.tm-card')).toBeNull();
  });

  it('opens a photo spot on click and steps through its photos', async () => {
    const user = userEvent.setup();
    const data = twoTracks();
    data.photos = [
      { imageId: 'img1', track: 0, t: T0 + 3_600_000, where: 'on' },
      { imageId: 'img2', track: 0, t: T0 + 3_600_000, where: 'notime' },
    ];
    open(data);
    await user.click(screen.getByRole('button', { name: 'Fotos einblenden' }));
    clickHandler(markerCalls()[2]!)();
    await waitFor(() => expect(document.querySelector('.tm-card')).not.toBeNull());
    const card = (): string => document.querySelector('.tm-card')!.textContent!;
    expect(card()).toContain('1/2');
    expect(document.querySelector('.tm-card .hold')).toBeNull();
    // A leader line joins the card to the spot on the map.
    expect(document.querySelector('.tm-leader line')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Nächstes Foto' }));
    expect(card()).toContain('2/2');
    expect(card()).toContain('ohne Aufnahmezeit');
    expect(document.querySelector('.tm-card img')!.getAttribute('src')).toContain('/img2/');
    // Escape closes the card first, then the dialog.
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.tm-card')).toBeNull();
  });

  it('opens a photo from its dot on the profile', async () => {
    const user = userEvent.setup();
    const { container } = open();
    await user.click(screen.getByRole('button', { name: 'Fotos einblenden' }));
    const dot = await waitFor(() => {
      const d = container.querySelector('svg.profile circle.photo');
      expect(d).not.toBeNull();
      return d!;
    });
    await fireEvent.click(dot);
    expect(document.querySelector('.tm-card img')).not.toBeNull();
  });

  it('has no photo button without photos', () => {
    const data = twoTracks();
    data.photos = [];
    open(data);
    expect(screen.queryByRole('button', { name: 'Fotos einblenden' })).toBeNull();
  });
});
