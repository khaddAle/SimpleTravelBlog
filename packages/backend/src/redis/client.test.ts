import { describe, it, expect } from 'vitest';
import { Redis } from 'ioredis';
import { buildRedisOptions, createRedis } from './client.js';

describe('buildRedisOptions', () => {
  it('uses sentinel options when sentinels are configured', () => {
    const opts = buildRedisOptions({
      name: 'blogmaster',
      host: '127.0.0.1',
      port: 6379,
      sentinels: [{ host: 's1', port: 26379 }],
      password: 'pw',
    });
    expect(opts.sentinels).toEqual([{ host: 's1', port: 26379 }]);
    expect(opts.name).toBe('blogmaster');
    expect(opts.password).toBe('pw');
    expect('host' in opts).toBe(false);
  });

  it('authenticates to the sentinels too (sentinelPassword) when a password is set', () => {
    // The platform sentinels require auth (bitnami uses the same password for the
    // data nodes and the sentinels); without sentinelPassword ioredis gets a
    // "NOAUTH Authentication required" and reports "All sentinels are unreachable".
    const opts = buildRedisOptions({
      name: 'mymaster',
      host: '127.0.0.1',
      port: 6379,
      sentinels: [{ host: 's1', port: 26379 }],
      password: 'pw',
    });
    expect(opts.sentinelPassword).toBe('pw');
  });

  it('omits sentinelPassword when no password is configured', () => {
    const opts = buildRedisOptions({
      name: 'mymaster',
      host: '127.0.0.1',
      port: 6379,
      sentinels: [{ host: 's1', port: 26379 }],
    });
    expect('sentinelPassword' in opts).toBe(false);
  });

  it('falls back to host/port when no sentinels are configured', () => {
    const opts = buildRedisOptions({ name: 'mymaster', host: 'redis', port: 6380 });
    expect(opts.host).toBe('redis');
    expect(opts.port).toBe(6380);
    expect(opts.sentinels).toBeUndefined();
  });

  it('omits password when not provided', () => {
    const opts = buildRedisOptions({ name: 'mymaster', host: 'redis', port: 6379 });
    expect('password' in opts).toBe(false);
  });

  it('passes through the key prefix when configured (shared-Redis isolation)', () => {
    const opts = buildRedisOptions({
      name: 'mymaster',
      host: 'redis',
      port: 6379,
      keyPrefix: 'travel-blog-prod:',
    });
    expect(opts.keyPrefix).toBe('travel-blog-prod:');
  });

  it('omits the key prefix when not configured', () => {
    const opts = buildRedisOptions({ name: 'mymaster', host: 'redis', port: 6379 });
    expect('keyPrefix' in opts).toBe(false);
  });

  it('createRedis builds a lazy (unconnected) client', async () => {
    const r = createRedis({ name: 'mymaster', host: '127.0.0.1', port: 6379 });
    expect(r).toBeInstanceOf(Redis);
    // lazyConnect: true means no socket is opened until a command is issued.
    expect(r.status).toBe('wait');
    r.disconnect();
  });
});
