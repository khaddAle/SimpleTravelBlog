import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import DividerBlock from './DividerBlock.svelte';

describe('DividerBlock', () => {
  it('renders a horizontal rule', () => {
    const { container } = render(DividerBlock);
    expect(container.querySelector('hr.block-divider')).not.toBeNull();
  });
});
