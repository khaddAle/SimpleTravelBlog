import { z } from 'zod';

/**
 * Environment schema — the single fail-fast gate for configuration. `loadConfig`
 * takes an env-like record (defaults to `process.env`) so it is unit-testable
 * without mutating the real environment. The server calls it once at boot; an
 * invalid environment throws before any listener starts.
 */
const sentinelListSchema = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((hostPort) => {
        const [host, port] = hostPort.split(':');
        return { host: host ?? '', port: Number(port ?? 26379) };
      }),
  );

// `z.coerce.boolean()` is unusable for env strings ("false" → true), so parse
// truthy tokens explicitly.
const boolish = z
  .string()
  .default('true')
  .transform((v) => /^(true|1|yes|on)$/i.test(v.trim()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_ORIGIN: z
    .string()
    .regex(/^https?:\/\//, 'must be an absolute http(s) URL')
    .default('http://localhost:4000'),

  MONGO_URI: z.string().min(1),

  // Redis: prefer Sentinel; fall back to a single host/port for local dev.
  REDIS_SENTINELS: sentinelListSchema.optional(),
  REDIS_MASTER_NAME: z.string().default('mymaster'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  // Namespaces every key (e.g. `travel-blog-dev:`). The platform Redis is a
  // single shared keyspace, so dev/prod must prefix to avoid colliding on keys
  // like `loginfails:<user>:<ip>` and `sess:<sid>`.
  REDIS_KEY_PREFIX: z.string().optional(),

  // Object storage (MinIO/S3).
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: boolish,
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  // Cookies / sessions.
  SESSION_COOKIE_SECRET: z.string().min(16),
  CSRF_COOKIE_SECRET: z.string().min(16),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1_209_600), // 14d

  // First-run admin bootstrap (optional; only used when the user table is empty).
  ADMIN_BOOTSTRAP_USERNAME: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  publicOrigin: string;
  mongoUri: string;
  redis: {
    sentinels?: { host: string; port: number }[];
    name: string;
    host: string;
    port: number;
    password?: string;
    keyPrefix?: string;
  };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    forcePathStyle: boolean;
    accessKey: string;
    secretKey: string;
  };
  sessionCookieSecret: string;
  csrfCookieSecret: string;
  sessionTtlSeconds: number;
  adminBootstrap?: { username: string; password: string };
  maxUploadBytes: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;

  const redis: Config['redis'] = {
    name: e.REDIS_MASTER_NAME,
    host: e.REDIS_HOST,
    port: e.REDIS_PORT,
    ...(e.REDIS_SENTINELS ? { sentinels: e.REDIS_SENTINELS } : {}),
    ...(e.REDIS_PASSWORD ? { password: e.REDIS_PASSWORD } : {}),
    ...(e.REDIS_KEY_PREFIX ? { keyPrefix: e.REDIS_KEY_PREFIX } : {}),
  };

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    publicOrigin: e.PUBLIC_ORIGIN,
    mongoUri: e.MONGO_URI,
    redis,
    s3: {
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      accessKey: e.S3_ACCESS_KEY,
      secretKey: e.S3_SECRET_KEY,
    },
    sessionCookieSecret: e.SESSION_COOKIE_SECRET,
    csrfCookieSecret: e.CSRF_COOKIE_SECRET,
    sessionTtlSeconds: e.SESSION_TTL_SECONDS,
    ...(e.ADMIN_BOOTSTRAP_USERNAME && e.ADMIN_BOOTSTRAP_PASSWORD
      ? {
          adminBootstrap: {
            username: e.ADMIN_BOOTSTRAP_USERNAME,
            password: e.ADMIN_BOOTSTRAP_PASSWORD,
          },
        }
      : {}),
    maxUploadBytes: e.MAX_UPLOAD_BYTES,
  };
}
