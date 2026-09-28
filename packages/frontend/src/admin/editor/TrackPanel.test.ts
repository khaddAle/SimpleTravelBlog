import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostTrackRef, TrackDto, TrackPreviewResponse } from '@stb/shared';
import { api, ApiError } from '../../lib/api.js';
import TrackPanel, { type TrackState } from './TrackPanel.svelte';

const stats = {
  distance: 19_520,
  ascent: 1025,
  descent: 1018,
  movingMs: 9_648_000,
  start: 0,
  end: 1,
  minEle: 0,
  maxEle: 800,
};
const dto = (id: string, name: string): TrackDto => ({
  id,
  originalFilename: `${id}.gpx`,
  name,
  stats,
});
const previewOf = (over: Partial<TrackPreviewResponse> = {}): TrackPreviewResponse => ({
  suggestion: { offset: 120, reason: 'Längengrad + Sommerzeit' },
  utcOffsetMinutes: 120,
  photos: [
    { imageId: 'a', track: 0, t: 0, where: 'on' },
    { imageId: 'b', track: 0, t: 0, where: 'before' },
    { imageId: 'c', track: 0, t: 0, where: 'notime' },
  ],
  ...over,
});

function setup(initial: Partial<TrackState> = {}, imageIds: string[] = ['a', 'b', 'c']) {
  const onChange = vi.fn<(next: TrackState) => void>();
  const value: TrackState = { tracks: [], ...initial };
  render(TrackPanel, { value, imageIds, onChange });
  return { onChange, last: () => onChange.mock.lastCall?.[0] };
}

const gpxFile = () => new File(['<gpx/>'], 'lauf.gpx', { type: 'application/gpx+xml' });

beforeEach(() => {
  vi.spyOn(api, 'getTrack').mockImplementation(async (id) => dto(id, `Track ${id}`));
  vi.spyOn(api, 'previewTracks').mockResolvedValue(previewOf());
});
afterEach(() => vi.restoreAllMocks());

describe('TrackPanel', () => {
  it('offers only the upload while the post has no track', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'GPS-Tracks' })).toBeInTheDocument();
    expect(screen.getByLabelText('GPX hochladen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Zeitzone der Fotos')).toBeNull();
    expect(api.previewTracks).not.toHaveBeenCalled();
  });

  it('uploads a GPX and adds it as "Person 1" with name and stats', async () => {
    const user = userEvent.setup();
    const upload = vi.spyOn(api, 'uploadTrack').mockResolvedValue(dto('t1', 'Morgenlauf'));
    const { last } = setup();
    await user.upload(screen.getByLabelText('GPX hochladen'), gpxFile());
    expect(upload).toHaveBeenCalled();
    await waitFor(() => expect(last()?.tracks).toEqual([{ trackId: 't1', label: 'Person 1' }]));
    expect(await screen.findByText('Morgenlauf')).toBeInTheDocument();
    expect(screen.getByText('19,5 km · 1.025 m ↑')).toBeInTheDocument();
  });

  it('shows the server error when a GPX is rejected', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'uploadTrack').mockRejectedValue(
      new ApiError(400, 'GPX ohne Zeitstempel wird nicht unterstützt'),
    );
    const { onChange } = setup();
    await user.upload(screen.getByLabelText('GPX hochladen'), gpxFile());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'GPX ohne Zeitstempel wird nicht unterstützt',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('loads names of attached tracks and edits a label', async () => {
    const user = userEvent.setup();
    const { last } = setup({ tracks: [{ trackId: 't1', label: 'Anna' }], utcOffsetMinutes: 120 });
    expect(await screen.findByText('Track t1')).toBeInTheDocument();
    const label = screen.getByLabelText('Bezeichnung');
    await user.clear(label);
    await user.type(label, 'Ben');
    expect(last()?.tracks).toEqual([{ trackId: 't1', label: 'Ben' }]);
  });

  it('asks for filename prefixes with two tracks and hides the upload', async () => {
    const user = userEvent.setup();
    const tracks: PostTrackRef[] = [
      { trackId: 't1', label: 'Anna' },
      { trackId: 't2', label: 'Ben' },
    ];
    const { last } = setup({ tracks, utcOffsetMinutes: 120 });
    expect(screen.queryByLabelText('GPX hochladen')).toBeNull();
    const prefixes = screen.getAllByLabelText('Dateiname beginnt mit');
    expect(prefixes).toHaveLength(2);
    await user.type(prefixes[1]!, 'PXL_');
    expect(last()?.tracks[1]).toEqual({ trackId: 't2', label: 'Ben', prefix: 'PXL_' });
  });

  it('removes a track', async () => {
    const user = userEvent.setup();
    const { last } = setup({
      tracks: [
        { trackId: 't1', label: 'Anna', prefix: 'IMG_' },
        { trackId: 't2', label: 'Ben', prefix: 'PXL_' },
      ],
      utcOffsetMinutes: 120,
    });
    const first = (await screen.findByText('Track t1')).closest('li')!;
    await user.click(within(first as HTMLElement).getByRole('button', { name: 'Entfernen' }));
    // A single track needs no prefix.
    expect(last()?.tracks).toEqual([{ trackId: 't2', label: 'Ben' }]);
  });

  it('previews the placement, shows the suggestion and summary', async () => {
    setup({ tracks: [{ trackId: 't1', label: 'Anna' }], utcOffsetMinutes: 60 });
    await waitFor(() =>
      expect(api.previewTracks).toHaveBeenCalledWith({
        tracks: [{ trackId: 't1', label: 'Anna' }],
        utcOffsetMinutes: 60,
        imageIds: ['a', 'b', 'c'],
      }),
    );
    expect(await screen.findByText('Vorschlag: UTC+2 (Längengrad + Sommerzeit)')).toBeInTheDocument();
    expect(screen.getByText('Fotos: 1 Anna · 1 am Start · 1 am Ende')).toBeInTheDocument();
  });

  it('prefills the offset from the suggestion when none is set', async () => {
    const { last } = setup({ tracks: [{ trackId: 't1', label: 'Anna' }] });
    await waitFor(() => expect(last()?.utcOffsetMinutes).toBe(120));
    expect(screen.getByLabelText('Zeitzone der Fotos')).toHaveValue('120');
  });

  it('changes the offset', async () => {
    const user = userEvent.setup();
    const { last } = setup({ tracks: [{ trackId: 't1', label: 'Anna' }], utcOffsetMinutes: 120 });
    await user.selectOptions(screen.getByLabelText('Zeitzone der Fotos'), 'UTC+5:30');
    expect(last()?.utcOffsetMinutes).toBe(330);
  });

  it('says so when the post has no photos yet', async () => {
    vi.spyOn(api, 'previewTracks').mockResolvedValue(previewOf({ photos: [] }));
    setup({ tracks: [{ trackId: 't1', label: 'Anna' }], utcOffsetMinutes: 120 }, []);
    expect(await screen.findByText('Noch keine Fotos im Beitrag.')).toBeInTheDocument();
  });
});
