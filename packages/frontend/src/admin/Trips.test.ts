import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { TripDto } from '@stb/shared';
import { api, ApiError } from '../lib/api.js';

vi.mock('svelte-spa-router', () => ({ push: vi.fn() }));

import Trips from './Trips.svelte';

function trip(id: string, name: string, postCount = 0): TripDto {
  return { id, name, postCount };
}

afterEach(() => vi.restoreAllMocks());

describe('Trips', () => {
  it('lists trips with their post counts', async () => {
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen', 3)]);
    render(Trips);
    expect(await screen.findByText('Alpen')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an empty hint when there are no trips', async () => {
    vi.spyOn(api, 'listTrips').mockResolvedValue([]);
    render(Trips);
    expect(await screen.findByText('Noch keine Reisen.')).toBeInTheDocument();
  });

  it('creates a trip and clears the input', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listTrips').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createTrip').mockResolvedValue(trip('t9', 'Norwegen'));
    render(Trips);
    await screen.findByRole('button', { name: 'Anlegen' });
    const input = screen.getByLabelText('Reisename') as HTMLInputElement;
    await user.type(input, 'Norwegen');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(create).toHaveBeenCalledWith('Norwegen');
    expect(await screen.findByText('Norwegen')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('shows a precise message when the new name already exists', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listTrips').mockResolvedValue([]);
    vi.spyOn(api, 'createTrip').mockRejectedValue(new ApiError(409, 'conflict'));
    render(Trips);
    await screen.findByRole('button', { name: 'Anlegen' });
    await user.type(screen.getByLabelText('Reisename'), 'Alpen');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(
      await screen.findByText('Eine Reise mit diesem Namen existiert bereits.'),
    ).toBeInTheDocument();
  });

  it('renames a trip inline', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen', 2)]);
    const update = vi.spyOn(api, 'updateTrip').mockResolvedValue(trip('t1', 'Alpen 2027', 2));
    render(Trips);
    await screen.findByText('Alpen');
    await user.click(screen.getByRole('button', { name: 'Umbenennen' }));
    const edit = screen.getByLabelText('Reise umbenennen') as HTMLInputElement;
    await user.clear(edit);
    await user.type(edit, 'Alpen 2027');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(update).toHaveBeenCalledWith('t1', 'Alpen 2027');
    expect(await screen.findByText('Alpen 2027')).toBeInTheDocument();
  });

  it('shows a precise message when a rename collides', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen'), trip('t2', 'Dolomiten')]);
    vi.spyOn(api, 'updateTrip').mockRejectedValue(new ApiError(409, 'conflict'));
    render(Trips);
    await screen.findByText('Dolomiten');
    const renameButtons = screen.getAllByRole('button', { name: 'Umbenennen' });
    await user.click(renameButtons[1]!); // Dolomiten
    const edit = screen.getByLabelText('Reise umbenennen');
    await user.clear(edit);
    await user.type(edit, 'Alpen');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Eine Reise mit diesem Namen existiert bereits.'),
    ).toBeInTheDocument();
  });

  it('cancels a rename without calling the API', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen')]);
    const update = vi.spyOn(api, 'updateTrip');
    render(Trips);
    await screen.findByText('Alpen');
    await user.click(screen.getByRole('button', { name: 'Umbenennen' }));
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('Alpen')).toBeInTheDocument();
  });

  it('deletes a trip after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen')]);
    const del = vi.spyOn(api, 'deleteTrip').mockResolvedValue();
    render(Trips);
    await screen.findByText('Alpen');
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(del).toHaveBeenCalledWith('t1');
    await waitFor(() => expect(screen.queryByText('Alpen')).toBeNull());
  });

  it('does not delete when the confirm is declined', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen')]);
    const del = vi.spyOn(api, 'deleteTrip').mockResolvedValue();
    render(Trips);
    await screen.findByText('Alpen');
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(del).not.toHaveBeenCalled();
  });

  it('lists the referencing posts when deletion is blocked (409)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'listTrips').mockResolvedValue([trip('t1', 'Alpen', 1)]);
    vi.spyOn(api, 'deleteTrip').mockRejectedValue(
      new ApiError(409, 'trip_in_use', {
        error: 'trip_in_use',
        posts: [{ id: 'p1', title: 'Berge' }],
      }),
    );
    render(Trips);
    await screen.findByText('Alpen');
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    // The blocking post is named and linkable so the author can reassign it.
    const link = await screen.findByRole('link', { name: 'Berge' });
    expect(link).toHaveAttribute('href', '#/admin/beitrag/p1');
    // …and the trip is still listed.
    expect(screen.getByText('Alpen')).toBeInTheDocument();
  });
});
