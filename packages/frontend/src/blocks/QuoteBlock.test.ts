import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import QuoteBlock from './QuoteBlock.svelte';

describe('QuoteBlock', () => {
  it('renders the quote and source', () => {
    render(QuoteBlock, { block: { type: 'quote', text: 'Reisen bildet', source: 'Oma' } });
    expect(screen.getByText('Reisen bildet')).toBeInTheDocument();
    expect(screen.getByText('— Oma')).toBeInTheDocument();
  });

  it('omits the cite when there is no source', () => {
    const { container } = render(QuoteBlock, {
      block: { type: 'quote', text: 'Reisen bildet' },
    });
    expect(container.querySelector('cite')).toBeNull();
  });
});
