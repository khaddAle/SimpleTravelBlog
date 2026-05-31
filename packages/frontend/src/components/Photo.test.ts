import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Photo from './Photo.svelte';

describe('Photo', () => {
  it('renders the mat → frame → img structure with the given ratio, src and alt', () => {
    const { container } = render(Photo, { src: '/img/x', alt: 'Berg', ratio: 'r54' });
    const mat = container.querySelector('.photo');
    expect(mat).toBeInTheDocument();
    const frame = mat?.querySelector('.frame.r54');
    expect(frame).toBeInTheDocument();
    const img = frame?.querySelector('img');
    expect(img).toHaveAttribute('src', '/img/x');
    expect(img).toHaveAttribute('alt', 'Berg');
  });

  it('defaults to the lead size (no .sm) and adds .sm for small photos', () => {
    const lead = render(Photo, { src: '/a', ratio: 'r43' });
    expect(lead.container.querySelector('.photo')).not.toHaveClass('sm');

    const small = render(Photo, { src: '/a', ratio: 'r43', size: 'sm' });
    expect(small.container.querySelector('.photo')).toHaveClass('sm');
  });

  it('supports every aspect ratio', () => {
    for (const ratio of ['r54', 'r43', 'r169', 'r11'] as const) {
      const { container } = render(Photo, { src: '/a', ratio });
      expect(container.querySelector(`.frame.${ratio}`)).toBeInTheDocument();
    }
  });

  it('wraps in a figure with a figcaption when a caption is given', () => {
    const { container } = render(Photo, { src: '/a', ratio: 'r43', caption: 'Am See' });
    const figure = container.querySelector('figure');
    expect(figure).toBeInTheDocument();
    expect(figure?.querySelector('.photo')).toBeInTheDocument();
    expect(screen.getByText('Am See').tagName.toLowerCase()).toBe('figcaption');
  });

  it('renders no figure or caption when none is given', () => {
    const { container } = render(Photo, { src: '/a', ratio: 'r43' });
    expect(container.querySelector('figure')).toBeNull();
    expect(container.querySelector('figcaption')).toBeNull();
  });

  it('renders an empty frame (no img) when src is omitted', () => {
    const { container } = render(Photo, { ratio: 'r11' });
    expect(container.querySelector('.frame.r11')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
