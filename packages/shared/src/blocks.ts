import { z } from 'zod';

/**
 * The ordered content of a post is a list of typed blocks. This discriminated
 * union is the single source of truth for both runtime validation (zod) and
 * compile-time types (`Block`), shared by backend and frontend.
 *
 * Reorder is ▲/▼ only (no drag-and-drop); the order is the array order.
 */
export const titleBlockSchema = z.object({
  type: z.literal('title'),
  text: z.string().min(1).max(200),
});

export const subtitleBlockSchema = z.object({
  type: z.literal('subtitle'),
  text: z.string().min(1).max(300),
});

export const paragraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string().min(1).max(10000),
});

export const imageBlockSchema = z.object({
  type: z.literal('image'),
  imageId: z.string().min(1),
  caption: z.string().max(300).optional(),
});

export const galleryBlockSchema = z.object({
  type: z.literal('gallery'),
  imageIds: z.array(z.string().min(1)).min(1).max(24),
  caption: z.string().max(300).optional(),
});

export const quoteBlockSchema = z.object({
  type: z.literal('quote'),
  text: z.string().min(1).max(1000),
  source: z.string().max(200).optional(),
});

export const dividerBlockSchema = z.object({
  type: z.literal('divider'),
});

export const blockSchema = z.discriminatedUnion('type', [
  titleBlockSchema,
  subtitleBlockSchema,
  paragraphBlockSchema,
  imageBlockSchema,
  galleryBlockSchema,
  quoteBlockSchema,
  dividerBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block['type'];

export const blockArraySchema = z.array(blockSchema);
