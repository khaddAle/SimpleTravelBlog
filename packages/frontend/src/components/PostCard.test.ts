import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PostDto } from '@stb/shared';
import PostCard from './PostCard.svelte';

const post: PostDto = {
  id: 'p1',
  title: 'Berge',
  blocks: [{ type: 'image', imageId: 'img1' }],
  postDate: '2026-03-05T00:00:00.000Z',
  country: 'DE',
  placeName: 'Zugspitze',
  lat: 0,
  lng: 0,
  status: 'published',
  createdAt: '2026-03-05T00:00:00.000Z',
  updatedAt: '2026-03-05T00:00:00.000Z',
};

describe('PostCard', () => {
  it('links to the post and shows title, date and place', () => {
    render(PostCard, { post });
    const link = screen.getByRole('link', { name: /Berge/ });
    expect(link).toHaveAttribute('href', '#/beitrag/p1');
    expect(screen.getByText(/Zugspitze/)).toBeInTheDocument();
    expect(screen.getByText(/5\. März 2026/)).toBeInTheDocument();
  });

  it('renders the cover thumbnail', () => {
    const { container } = render(PostCard, { post });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/thumb',
    );
  });

  it('prefers an explicit coverImageId over the first block image', () => {
    const { container } = render(PostCard, {
      post: { ...post, coverImageId: 'cov9' },
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/images/cov9/thumb',
    );
  });

  it('falls back to the block thumbnail when no coverImageId is set', () => {
    const { container } = render(PostCard, {
      post: { ...post, coverImageId: undefined },
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/public/images/img1/thumb',
    );
  });
});
