import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import type { EventSourceLike } from '../../lib/uploads.js';
import type { ImageDto } from '@stb/shared';
import UploadProgress from './UploadProgress.svelte';

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close(): void {
    this.closed = true;
  }
}

const sampleImage: ImageDto = {
  id: 'img1',
  originalFilename: 'foto.jpg',
  mime: 'image/jpeg',
  width: 1600,
  height: 1200,
  displayUrl: '/api/public/images/img1/display',
  thumbUrl: '/api/public/images/img1/thumb',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderWithFake(props: Record<string, unknown> = {}) {
  let es: FakeEventSource | undefined;
  const result = render(UploadProgress, {
    uploadId: 'up1',
    eventSourceFactory: (url: string) => (es = new FakeEventSource(url)),
    ...props,
  });
  flushSync();
  return { es: () => es!, ...result };
}

describe('UploadProgress', () => {
  it('shows the progress percentage', () => {
    const { es } = renderWithFake();
    es().emit({ type: 'progress', pct: 42 });
    flushSync();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it('shows success and calls onDone', () => {
    const onDone = vi.fn();
    const { es } = renderWithFake({ onDone });
    es().emit({ type: 'done', image: sampleImage });
    flushSync();
    expect(screen.getByText('Hochgeladen.')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledWith(sampleImage);
  });

  it('shows an error and calls onError', () => {
    const onError = vi.fn();
    const { es } = renderWithFake({ onError });
    es().emit({ type: 'error', message: 'kaputt' });
    flushSync();
    expect(screen.getByRole('alert')).toHaveTextContent('Fehler: kaputt');
    expect(onError).toHaveBeenCalledWith('kaputt');
  });
});
