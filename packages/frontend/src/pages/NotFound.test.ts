import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NotFound from './NotFound.svelte';

describe('NotFound', () => {
  it('shows a not-found message and a home link', () => {
    render(NotFound);
    expect(screen.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '#/');
  });
});
