import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ParagraphBlock from './ParagraphBlock.svelte';

describe('ParagraphBlock', () => {
  it('renders the paragraph text as prose inside the reading column', () => {
    const { container } = render(ParagraphBlock, {
      block: { type: 'paragraph', text: 'Wir wanderten lange.' },
    });
    const p = container.querySelector('.wrap-narrow .prose p');
    expect(p?.textContent).toBe('Wir wanderten lange.');
  });
});
