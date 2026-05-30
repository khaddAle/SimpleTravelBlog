import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ImageDto } from '@stb/shared';
import { api } from '../../lib/api.js';
import type { EventSourceLike } from '../../lib/uploads.js';
import ImagePicker from './ImagePicker.svelte';

function makeImage(id: string, filename: string): ImageDto {
  return {
    id,
    originalFilename: filename,
    mime: 'image/jpeg',
    width: 1600,
    height: 1200,
    displayUrl: `/api/public/images/${id}/display`,
    thumbUrl: `/api/public/images/${id}/thumb`,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const twoImages = [makeImage('a', 'alpha.jpg'), makeImage('b', 'beta.jpg')];

beforeEach(() => {
  vi.spyOn(api, 'listImages').mockResolvedValue({
    items: twoImages,
    page: 1,
    pageSize: 24,
    total: 2,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('ImagePicker browsing', () => {
  it('renders images from the API', async () => {
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    expect(await screen.findByLabelText('alpha.jpg')).toBeInTheDocument();
    expect(screen.getByLabelText('beta.jpg')).toBeInTheDocument();
  });

  it('single-select then confirm returns one id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(ImagePicker, { onSelect, onCancel: vi.fn() });
    await user.click(await screen.findByLabelText('alpha.jpg'));
    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    expect(onSelect).toHaveBeenCalledWith(['a']);
  });

  it('multi-select returns all chosen ids', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(ImagePicker, { mode: 'multiple', onSelect, onCancel: vi.fn() });
    await user.click(await screen.findByLabelText('alpha.jpg'));
    await user.click(screen.getByLabelText('beta.jpg'));
    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    expect(onSelect).toHaveBeenCalledWith(['a', 'b']);
  });

  it('shows how many images are currently selected', async () => {
    const user = userEvent.setup();
    render(ImagePicker, { mode: 'multiple', onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    expect(screen.getByText('0 ausgewählt')).toBeInTheDocument();
    await user.click(screen.getByLabelText('alpha.jpg'));
    expect(screen.getByText('1 ausgewählt')).toBeInTheDocument();
    await user.click(screen.getByLabelText('beta.jpg'));
    expect(screen.getByText('2 ausgewählt')).toBeInTheDocument();
  });

  it('confirm is disabled with no selection', async () => {
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    expect(screen.getByRole('button', { name: 'Auswählen' })).toBeDisabled();
  });

  it('filters by filename', async () => {
    const user = userEvent.setup();
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    await user.type(screen.getByLabelText('Dateiname filtern'), 'beta');
    await waitFor(() => {
      expect(api.listImages).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'beta', page: 1 }),
      );
    });
  });

  it('toggles the orphans-only filter', async () => {
    const user = userEvent.setup();
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    await user.click(screen.getByLabelText('Nur unbenutzte'));
    await waitFor(() => {
      expect(api.listImages).toHaveBeenLastCalledWith(
        expect.objectContaining({ orphansOnly: true }),
      );
    });
  });

  it('shows an empty message when there are no images', async () => {
    vi.mocked(api.listImages).mockResolvedValue({ items: [], page: 1, pageSize: 24, total: 0 });
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    expect(await screen.findByText('Keine Bilder gefunden.')).toBeInTheDocument();
  });

  it('paginates', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listImages).mockResolvedValue({
      items: twoImages,
      page: 1,
      pageSize: 24,
      total: 50,
    });
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await waitFor(() => {
      expect(api.listImages).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  it('cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(ImagePicker, { onSelect: vi.fn(), onCancel });
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('the ✕ button also cancels', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(ImagePicker, { onSelect: vi.fn(), onCancel });
    await user.click(await screen.findByLabelText('Schließen'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows an error when the upload request fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'uploadImage').mockRejectedValue(new Error('zu groß'));
    render(ImagePicker, { onSelect: vi.fn(), onCancel: vi.fn() });
    await screen.findByLabelText('alpha.jpg');
    const file = new File([new Uint8Array([1])], 'neu.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Hochladen'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('zu groß');
  });
});

describe('ImagePicker upload', () => {
  class FakeEventSource implements EventSourceLike {
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(public url: string) {}
    emit(data: unknown): void {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
    close(): void {}
  }
  let current: FakeEventSource | undefined;

  it('uploads a file and pre-selects it on completion', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'uploadImage').mockResolvedValue({ uploadId: 'up1', imageId: 'c' });
    const onSelect = vi.fn();
    render(ImagePicker, {
      onSelect,
      onCancel: vi.fn(),
      eventSourceFactory: (url: string) => {
        current = new FakeEventSource(url);
        return current;
      },
    });
    await screen.findByLabelText('alpha.jpg');

    const file = new File([new Uint8Array([1])], 'neu.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Hochladen'), file);
    expect(api.uploadImage).toHaveBeenCalledWith(file);

    await waitFor(() => expect(current).toBeDefined());
    current!.emit({ type: 'done', image: makeImage('c', 'neu.jpg') });

    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    expect(onSelect).toHaveBeenCalledWith(['c']);
  });
});

describe('ImagePicker multi-upload', () => {
  class FakeEventSource implements EventSourceLike {
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(public url: string) {}
    emit(data: unknown): void {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
    close(): void {}
  }

  function jpeg(name: string): File {
    return new File([new Uint8Array([1])], name, { type: 'image/jpeg' });
  }

  it('uploads several files at once and pre-selects each on completion', async () => {
    const user = userEvent.setup();
    let n = 0;
    vi.spyOn(api, 'uploadImage').mockImplementation(async () => {
      n += 1;
      return { uploadId: `up${n}`, imageId: `img${n}` };
    });
    const sources: Record<string, FakeEventSource> = {};
    const onSelect = vi.fn();
    render(ImagePicker, {
      mode: 'multiple',
      onSelect,
      onCancel: vi.fn(),
      eventSourceFactory: (url: string) => {
        const id = url.split('/')[4]!; // /api/images/upload/<id>/progress
        const s = new FakeEventSource(url);
        sources[id] = s;
        return s;
      },
    });
    await screen.findByLabelText('alpha.jpg');

    await user.upload(screen.getByLabelText('Hochladen'), [jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(api.uploadImage).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(Object.keys(sources)).toHaveLength(2));
    sources['up1']!.emit({ type: 'done', image: makeImage('img1', 'a.jpg') });
    sources['up2']!.emit({ type: 'done', image: makeImage('img2', 'b.jpg') });

    await user.click(screen.getByRole('button', { name: 'Auswählen' }));
    expect(onSelect).toHaveBeenCalledWith(['img1', 'img2']);
  });

  it('uploads at most three files concurrently', async () => {
    const user = userEvent.setup();
    // Never resolves: blocked workers cannot start a fourth upload.
    vi.spyOn(api, 'uploadImage').mockImplementation(() => new Promise(() => {}));
    render(ImagePicker, {
      mode: 'multiple',
      onSelect: vi.fn(),
      onCancel: vi.fn(),
      eventSourceFactory: (url: string) => new FakeEventSource(url),
    });
    await screen.findByLabelText('alpha.jpg');

    const files = Array.from({ length: 5 }, (_, i) => jpeg(`f${i}.jpg`));
    await user.upload(screen.getByLabelText('Hochladen'), files);

    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledTimes(3));
    // Let any stray extra worker fire, then confirm the cap held.
    await new Promise((r) => setTimeout(r, 20));
    expect(api.uploadImage).toHaveBeenCalledTimes(3);
  });
});
