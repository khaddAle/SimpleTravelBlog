import type { ImageVariant } from '@stb/shared';

/**
 * Public URL for an image variant. Mirrors the backend's `imageVariantUrl`
 * (`/api/public/images/<shortId>/<variant>`); these are served with a long
 * immutable cache header, so the shortId is the cache key.
 */
export function imageUrl(id: string, variant: ImageVariant = 'display'): string {
  return `/api/public/images/${id}/${variant}`;
}
