import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TitleBlock from './TitleBlock.svelte';

describe('TitleBlock', () => {
  it('renders the text as a level-2 heading', () => {
    render(TitleBlock, { block: { type: 'title', text: 'Berge' } });
    expect(screen.getByRole('heading', { level: 2, name: 'Berge' })).toBeInTheDocument();
  });
});
