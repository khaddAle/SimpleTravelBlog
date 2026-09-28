import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { buildTrackModel } from '../../lib/track/model.js';
import TrackStats from './TrackStats.svelte';
import { oneTrack, twoTracks } from '../../../tests/trackData.js';

describe('TrackStats', () => {
  it('shows distance, ascent, descent and moving time per person', () => {
    render(TrackStats, { model: buildTrackModel(twoTracks()) });
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText('2,3 km')).toBeInTheDocument();
    expect(screen.getByText('200 m')).toBeInTheDocument();
    expect(screen.getByText('100 m')).toBeInTheDocument();
    expect(screen.getByText('0:55 h')).toBeInTheDocument();
    expect(screen.getByText('2,5 km')).toBeInTheDocument();
  });

  it('leaves out the person label with a single track', () => {
    render(TrackStats, { model: buildTrackModel(oneTrack()) });
    expect(screen.getByText('2,3 km')).toBeInTheDocument();
    expect(screen.queryByText('Anna')).toBeNull();
  });
});
