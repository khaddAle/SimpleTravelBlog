import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import DividerBlock from './DividerBlock.svelte';

describe('DividerBlock', () => {
  it('renders the three-dot divider inside the reading column', () => {
    const { container } = render(DividerBlock);
    const divider = container.querySelector('.wrap-narrow .divider-block');
    expect(divider).not.toBeNull();
    expect(divider?.querySelectorAll('span')).toHaveLength(3);
  });
});
