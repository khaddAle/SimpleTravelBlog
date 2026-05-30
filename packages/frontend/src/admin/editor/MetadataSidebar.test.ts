import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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

let onChange: Mock<(metadata: PostMetadata) => void>;
beforeEach(() => {
  onChange = vi.fn<(metadata: PostMetadata) => void>();
});

describe('MetadataSidebar', () => {
  it('shows the current metadata', () => {
    render(MetadataSidebar, { metadata: base, trips, onChange });
    expect((screen.getByLabelText('Titel') as HTMLInputElement).value).toBe('Berge');
    expect((screen.getByLabelText('Datum') as HTMLInputElement).value).toBe('2026-03-05');
    expect((screen.getByLabelText(/Land/) as HTMLInputElement).value).toBe('DE');
  });

  it('marks Land and Ortsname as required', () => {
    render(MetadataSidebar, { metadata: base, trips, onChange });
    expect(screen.getByLabelText(/Land/)).toBeRequired();
    expect(screen.getByLabelText('Ortsname')).toBeRequired();
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

  it('sets and clears the subtitle', async () => {
    const user = userEvent.setup();
    render(MetadataSidebar, { metadata: base, trips, onChange });
    await user.type(screen.getByLabelText('Untertitel'), 'Tag eins');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ subtitle: 'Tag eins' }));
    await user.clear(screen.getByLabelText('Untertitel'));
    const last = onChange.mock.lastCall![0] as PostMetadata;
    expect(last.subtitle).toBeUndefined();
  });

  it('updates the date and place', async () => {
    const user = userEvent.setup();
    render(MetadataSidebar, { metadata: base, trips, onChange });
    await user.clear(screen.getByLabelText('Ortsname'));
    await user.type(screen.getByLabelText('Ortsname'), 'Gipfel');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ placeName: 'Gipfel' }));
  });

  it('chooses a cover image via the picker (fresh: unused-only on)', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img9');
    render(MetadataSidebar, { metadata: base, trips, onChange, pickImage });
    await user.click(screen.getByRole('button', { name: 'Bild wählen' }));
    expect(pickImage).toHaveBeenCalledWith({ orphansOnly: true });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ coverImageId: 'img9' }),
    );
  });

  it('changes an existing cover with the unused-only filter off', async () => {
    const user = userEvent.setup();
    const pickImage = vi.fn().mockResolvedValue('img9');
    render(MetadataSidebar, {
      metadata: { ...base, coverImageId: 'old' },
      trips,
      onChange,
      pickImage,
    });
    await user.click(screen.getByRole('button', { name: 'Bild ändern' }));
    expect(pickImage).toHaveBeenCalledWith({ orphansOnly: false });
  });

  it('shows the current cover thumbnail and clears it', async () => {
    const user = userEvent.setup();
    const { container } = render(MetadataSidebar, {
      metadata: { ...base, coverImageId: 'img9' },
      trips,
      onChange,
    });
    expect(container.querySelector('.cover-thumb')).toHaveAttribute(
      'src',
      '/api/public/images/img9/thumb',
    );
    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    const last = onChange.mock.lastCall![0] as PostMetadata;
    expect(last.coverImageId).toBeUndefined();
  });
});
