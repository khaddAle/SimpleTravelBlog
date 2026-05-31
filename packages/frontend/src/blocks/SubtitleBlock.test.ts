import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SubtitleBlock from './SubtitleBlock.svelte';

describe('SubtitleBlock', () => {
  it('renders the text as a level-3 heading in the reading column', () => {
    const { container } = render(SubtitleBlock, { block: { type: 'subtitle', text: 'Tag eins' } });
    expect(screen.getByRole('heading', { level: 3, name: 'Tag eins' })).toBeInTheDocument();
    expect(container.querySelector('.wrap-narrow h3')).not.toBeNull();
  });
});
