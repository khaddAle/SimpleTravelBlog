import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ParagraphBlock from './ParagraphBlock.svelte';

describe('ParagraphBlock', () => {
  it('renders the paragraph text', () => {
    render(ParagraphBlock, { block: { type: 'paragraph', text: 'Wir wanderten lange.' } });
    expect(screen.getByText('Wir wanderten lange.')).toBeInTheDocument();
  });
});
