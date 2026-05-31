import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import QuoteBlock from './QuoteBlock.svelte';

describe('QuoteBlock', () => {
  it('renders the quote as a pull-quote with its source as a cite', () => {
    const { container } = render(QuoteBlock, {
      block: { type: 'quote', text: 'Reisen bildet', source: 'Oma' },
    });
    const quote = container.querySelector('.wrap-narrow blockquote.pullquote');
    expect(quote).not.toBeNull();
    expect(quote?.querySelector('p')?.textContent).toContain('Reisen bildet');
    expect(quote?.querySelector('cite')?.textContent).toBe('Oma');
  });

  it('omits the cite when there is no source', () => {
    const { container } = render(QuoteBlock, {
      block: { type: 'quote', text: 'Reisen bildet' },
    });
    expect(container.querySelector('cite')).toBeNull();
  });
});
