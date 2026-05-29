import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  MONGO_URI: 'mongodb://localhost:27017/blog',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'travel-blog-images-dev',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  SESSION_COOKIE_SECRET: 'x'.repeat(32),
  CSRF_COOKIE_SECRET: 'y'.repeat(32),
};

describe('loadConfig', () => {
  it('parses a minimal valid environment and applies defaults', () => {
    const cfg = loadConfig(base);
    expect(cfg.port).toBe(4000);
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.sessionTtlSeconds).toBe(1_209_600);
    expect(cfg.s3.forcePathStyle).toBe(true);
    expect(cfg.s3.region).toBe('us-east-1');
    expect(cfg.maxUploadBytes).toBe(20 * 1024 * 1024);
  });

  it('coerces numeric and boolean env strings', () => {
    const cfg = loadConfig({ ...base, PORT: '8080', S3_FORCE_PATH_STYLE: 'false' });
    expect(cfg.port).toBe(8080);
    expect(cfg.s3.forcePathStyle).toBe(false);
  });

  it('parses a comma-separated sentinel list', () => {
    const cfg = loadConfig({
      ...base,
      REDIS_SENTINELS: 'sentinel-a:26379, sentinel-b:26379',
      REDIS_MASTER_NAME: 'blogmaster',
    });
    expect(cfg.redis.sentinels).toEqual([
      { host: 'sentinel-a', port: 26379 },
      { host: 'sentinel-b', port: 26379 },
    ]);
    expect(cfg.redis.name).toBe('blogmaster');
  });

  it('falls back to a single host/port when no sentinels are given', () => {
    const cfg = loadConfig({ ...base, REDIS_HOST: 'redis', REDIS_PORT: '6380' });
    expect(cfg.redis.sentinels).toBeUndefined();
    expect(cfg.redis.host).toBe('redis');
    expect(cfg.redis.port).toBe(6380);
  });

  it('exposes the optional Redis key prefix when present', () => {
    const cfg = loadConfig({ ...base, REDIS_KEY_PREFIX: 'travel-blog-dev:' });
    expect(cfg.redis.keyPrefix).toBe('travel-blog-dev:');
  });

  it('omits the Redis key prefix when absent', () => {
    const cfg = loadConfig(base);
    expect(cfg.redis.keyPrefix).toBeUndefined();
  });

  it('throws (fail-fast) when a required var is missing', () => {
    const { MONGO_URI: _omit, ...withoutMongo } = base;
    expect(() => loadConfig(withoutMongo)).toThrow(/MONGO_URI/);
  });

  it('rejects a too-short session secret', () => {
    expect(() => loadConfig({ ...base, SESSION_COOKIE_SECRET: 'short' })).toThrow(
      /SESSION_COOKIE_SECRET/,
    );
  });

  it('exposes optional admin bootstrap credentials when present', () => {
    const cfg = loadConfig({
      ...base,
      ADMIN_BOOTSTRAP_USERNAME: 'root',
      ADMIN_BOOTSTRAP_PASSWORD: 'hunter2hunter2',
    });
    expect(cfg.adminBootstrap).toEqual({
      username: 'root',
      password: 'hunter2hunter2',
    });
  });
});
