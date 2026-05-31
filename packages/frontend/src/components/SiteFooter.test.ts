import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SiteFooter from './SiteFooter.svelte';

describe('SiteFooter', () => {
  it('renders the two ghost navigation buttons', () => {
    render(SiteFooter);
    expect(screen.getByRole('link', { name: 'Kartenansicht' })).toHaveAttribute('href', '#/karte');
    expect(screen.getByRole('link', { name: 'Alle Beiträge' })).toHaveAttribute('href', '#/archiv');
  });

  it('shows the private-diary note with the site title', () => {
    render(SiteFooter);
    expect(screen.getByText(/Ein privates Reisetagebuch/)).toBeInTheDocument();
    expect(screen.getByText(/Reiseblog/)).toBeInTheDocument();
  });

  it('links the Redaktion note to the login route', () => {
    render(SiteFooter);
    expect(screen.getByRole('link', { name: 'Redaktion' })).toHaveAttribute('href', '#/login');
  });
});
