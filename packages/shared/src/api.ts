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

/**
 * Query-string boolean. `z.coerce.boolean()` maps any non-empty string (incl.
 * "false") to `true`, so parse truthy tokens explicitly. Absent → false.
 */
export const queryBooleanSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) =>
    v === true || (typeof v === 'string' && /^(true|1|yes|on)$/i.test(v.trim())),
  );

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

/** Post as returned to clients. Ids are opaque shortIds, dates ISO strings. */
export const postDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  blocks: blockArraySchema,
  postDate: z.string(),
  country: isoCountrySchema,
  placeName: z.string(),
  lat: latSchema,
  lng: lngSchema,
  tripId: z.string().optional(),
  status: postStatusSchema,
  publishedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PostDto = z.infer<typeof postDtoSchema>;

// --- trips ---
export const createTripRequestSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateTripRequest = z.infer<typeof createTripRequestSchema>;

export const tripDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  postCount: z.number().int().nonnegative().optional(),
});
export type TripDto = z.infer<typeof tripDtoSchema>;

// --- images ---
export const imageDtoSchema = z.object({
  id: z.string(),
  originalFilename: z.string(),
  mime: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  displayUrl: z.string(),
  thumbUrl: z.string(),
  createdAt: z.string(),
});
export type ImageDto = z.infer<typeof imageDtoSchema>;

export const imageVariantSchema = z.enum(['display', 'thumb']);
export type ImageVariant = z.infer<typeof imageVariantSchema>;

export const uploadAcceptedSchema = z.object({
  uploadId: z.string(),
  imageId: z.string(),
});
export type UploadAccepted = z.infer<typeof uploadAcceptedSchema>;

// --- pagination ---
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const imageListQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  orphansOnly: queryBooleanSchema,
  sort: z.enum(['newest', 'oldest', 'filename']).default('newest'),
});
export type ImageListQuery = z.infer<typeof imageListQuerySchema>;

// --- users ---
export const createUserRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(1024),
  role: roleSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    password: z.string().min(8).max(1024).optional(),
    role: roleSchema.optional(),
    deactivated: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const userListItemSchema = userDtoSchema.extend({
  deactivated: z.boolean(),
  createdAt: z.string(),
});
export type UserListItem = z.infer<typeof userListItemSchema>;

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

export const updateSettingsRequestSchema = settingsDtoSchema;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
