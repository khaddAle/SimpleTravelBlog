import { Redis, type RedisOptions } from 'ioredis';
import type { Config } from '../config.js';

/**
 * Build ioredis options from config. Pure + exported so the
 * Sentinel-vs-single-node branching is unit-testable without opening a socket.
 * Prefers Sentinel (HA topology) and falls back to a single host/port for
 * local dev.
 */
export function buildRedisOptions(cfg: Config['redis']): RedisOptions {
  const base: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    ...(cfg.password ? { password: cfg.password } : {}),
    ...(cfg.keyPrefix ? { keyPrefix: cfg.keyPrefix } : {}),
  };
  if (cfg.sentinels && cfg.sentinels.length > 0) {
    return { ...base, sentinels: cfg.sentinels, name: cfg.name };
  }
  return { ...base, host: cfg.host, port: cfg.port };
}

export function createRedis(cfg: Config['redis']): Redis {
  return new Redis(buildRedisOptions(cfg));
}
