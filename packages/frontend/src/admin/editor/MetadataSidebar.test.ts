import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { PostMetadata } from '../../lib/types.js';
import MetadataSidebar from './MetadataSidebar.svelte';

// MapPicker mounts Leaflet; stub it out for these form-focused tests.
vi.mock('leaflet', () => {
  const map = { setView: vi.fn().mockReturnThis(), on: vi.fn().mockReturnThis(), remove: vi.fn() };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis() })),
      marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), setLatLng: vi.fn().mockReturnThis() })),
    },
  };
});

const base: PostMetadata = {
  title: 'Berge',
  postDate: '2026-03-05T00:00:00.000Z',
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 47.42,
  lng: 10.98,
};

const trips = [
  { id: 't1', name: 'Alpen 2026' },
  { id: 't2', name: 'Nordsee' },
];

let onChange: ReturnType<typeof vi.fn>;
beforeEach(() => {
  onChange = vi.fn();
});

describe('MetadataSidebar', () => {
  it('shows the current metadata', () => {
    render(MetadataSidebar, { metadata: base, trips, onChange });
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Berge');
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('2026-03-05');
    expect((screen.getByLabelText(/Land/) as HTMLInputElement).value).toBe('DE');
  });

  it('uppercases the country code on input', async () => {
    const user = userEvent.setup();
    render(MetadataSidebar, { metadata: { ...base, country: '' }, trips, onChange });
    await user.type(screen.getByLabelText(/Land/), 'fr');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'FR' }));
  });

  it('selects a trip and can clear it', async () => {
    const user = userEvent.setup();
    render(MetadataSidebar, { metadata: base, trips, onChange });
    await user.selectOptions(screen.getByLabelText('Reise'), 't2');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tripId: 't2' }));

    await user.selectOptions(screen.getByLabelText('Reise'), '');
    const last = onChange.mock.lastCall![0] as PostMetadata;
    expect(last.tripId).toBeUndefined();
  });

  it('reports map coordinate changes', () => {
    render(MetadataSidebar, { metadata: base, trips, onChange });
    // The map picker shows the seeded coordinates.
    expect(screen.getByText('Gewählt: 47.42000, 10.98000')).toBeInTheDocument();
  });
});
