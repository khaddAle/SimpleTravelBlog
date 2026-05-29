import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createStorage, createS3Client } from './s3.js';

const s3cfg = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  bucket: 'travel-blog-images-dev',
  forcePathStyle: true,
  accessKey: 'access',
  secretKey: 'secret',
};

const s3Mock = mockClient(S3Client);
beforeEach(() => s3Mock.reset());

describe('S3 storage wrapper', () => {
  it('PutObject sends bucket, key, body and content-type', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const storage = createStorage(s3cfg, new S3Client({}));
    await storage.putObject('posts/x-display.webp', Buffer.from('data'), 'image/webp');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input).toMatchObject({
      Bucket: 'travel-blog-images-dev',
      Key: 'posts/x-display.webp',
      ContentType: 'image/webp',
    });
  });

  it('GetObject returns the body as a Buffer', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3]),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const storage = createStorage(s3cfg, new S3Client({}));
    const buf = await storage.getObject('posts/x-display.webp');
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it('GetObject throws on an empty body', async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const storage = createStorage(s3cfg, new S3Client({}));
    await expect(storage.getObject('missing')).rejects.toThrow(/Empty body/);
  });

  it('createS3Client constructs an S3Client from config', () => {
    expect(createS3Client(s3cfg)).toBeInstanceOf(S3Client);
  });

  it('DeleteObject targets the right bucket + key', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({});
    const storage = createStorage(s3cfg, new S3Client({}));
    await storage.deleteObject('posts/x-thumb.webp');

    const calls = s3Mock.commandCalls(DeleteObjectCommand);
    expect(calls[0]?.args[0].input).toMatchObject({
      Bucket: 'travel-blog-images-dev',
      Key: 'posts/x-thumb.webp',
    });
  });
});
