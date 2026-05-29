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

  it('createRedis builds a lazy (unconnected) client', async () => {
    const r = createRedis({ name: 'mymaster', host: '127.0.0.1', port: 6379 });
    expect(r).toBeInstanceOf(Redis);
    // lazyConnect: true means no socket is opened until a command is issued.
    expect(r.status).toBe('wait');
    r.disconnect();
  });
});
