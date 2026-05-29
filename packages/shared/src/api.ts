import { z } from 'zod';
import { blockArraySchema } from './blocks.js';

/**
 * Request/response DTO schemas shared by backend (validation) and frontend
 * (typing + client-side pre-validation). The backend zod parse is authoritative.
 */

// --- shared scalars ---
export const isoCountrySchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2, uppercase');

export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);
export const postStatusSchema = z.enum(['draft', 'published']);
export const roleSchema = z.enum(['admin', 'editor']);

// --- auth ---
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: roleSchema,
});
export type UserDto = z.infer<typeof userDtoSchema>;

// --- posts ---
export const postMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  postDate: z.string().datetime(),
  country: isoCountrySchema,
  placeName: z.string().min(1).max(200),
  lat: latSchema,
  lng: lngSchema,
  tripId: z.string().optional(),
});

export const createPostRequestSchema = postMetadataSchema.extend({
  blocks: blockArraySchema,
});
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;

export const updatePostRequestSchema = createPostRequestSchema.partial().extend({
  status: postStatusSchema.optional(),
});
export type UpdatePostRequest = z.infer<typeof updatePostRequestSchema>;

// --- trips ---
export const createTripRequestSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateTripRequest = z.infer<typeof createTripRequestSchema>;

// --- search ---
export const searchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  country: isoCountrySchema.optional(),
  tripId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

// --- settings ---
export const settingsDtoSchema = z.object({
  siteTitle: z.string().min(1).max(120),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoKey: z.string().optional(),
});
export type SettingsDto = z.infer<typeof settingsDtoSchema>;
