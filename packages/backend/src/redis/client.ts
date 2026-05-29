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
    return {
      ...base,
      sentinels: cfg.sentinels,
      name: cfg.name,
      // The Sentinel nodes require auth too (the platform uses one password for
      // both the data nodes and the sentinels). `password` alone authenticates to
      // the master; without `sentinelPassword` ioredis gets "NOAUTH Authentication
      // required" from the sentinels and reports "All sentinels are unreachable".
      ...(cfg.password ? { sentinelPassword: cfg.password } : {}),
    };
  }
  return { ...base, host: cfg.host, port: cfg.port };
}

export function createRedis(cfg: Config['redis']): Redis {
  return new Redis(buildRedisOptions(cfg));
}
