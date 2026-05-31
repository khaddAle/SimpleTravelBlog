import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SiteHeader from './SiteHeader.svelte';

describe('SiteHeader', () => {
  it('renders the brand (site title + tagline) linking home', () => {
    render(SiteHeader);
    const brand = screen.getByRole('link', { name: /Reiseblog/ });
    expect(brand).toHaveAttribute('href', '#/');
    expect(screen.getByText('Reisetagebuch')).toBeInTheDocument();
  });

  it('renders the four nav links with German labels and hash routes', () => {
    render(SiteHeader);
    expect(screen.getByRole('link', { name: 'Beiträge' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('href', '#/karte');
    expect(screen.getByRole('link', { name: 'Archiv' })).toHaveAttribute('href', '#/archiv');
    expect(screen.getByRole('link', { name: 'Suche' })).toHaveAttribute('href', '#/suche');
  });

  it('marks the current section with aria-current="page"', () => {
    render(SiteHeader, { current: 'karte' });
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Archiv' })).not.toHaveAttribute('aria-current');
  });

  it('toggles the mobile menu open and closed via the hamburger', async () => {
    const user = userEvent.setup();
    const { container } = render(SiteHeader);
    const header = container.querySelector('.site-header');
    const toggle = screen.getByRole('button', { name: 'Menü öffnen' });
    expect(header).not.toHaveClass('nav-open');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(header).toHaveClass('nav-open');
    expect(screen.getByRole('button', { name: 'Menü schließen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Menü schließen' }));
    expect(header).not.toHaveClass('nav-open');
  });

  it('closes the menu when a nav link is tapped', async () => {
    const user = userEvent.setup();
    const { container } = render(SiteHeader);
    const header = container.querySelector('.site-header');
    await user.click(screen.getByRole('button', { name: 'Menü öffnen' }));
    expect(header).toHaveClass('nav-open');
    await user.click(screen.getByRole('link', { name: 'Archiv' }));
    expect(header).not.toHaveClass('nav-open');
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    const { container } = render(SiteHeader);
    const header = container.querySelector('.site-header');
    await user.click(screen.getByRole('button', { name: 'Menü öffnen' }));
    expect(header).toHaveClass('nav-open');
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(header).not.toHaveClass('nav-open');
  });
});
