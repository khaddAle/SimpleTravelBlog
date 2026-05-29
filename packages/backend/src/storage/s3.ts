import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Config } from '../config.js';

export interface ObjectStorage {
  readonly client: S3Client;
  readonly bucket: string;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export function createS3Client(cfg: Config['s3']): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  });
}

/**
 * Thin storage wrapper over the S3 client. The client is injectable so tests
 * can pass an aws-sdk-client-mock-backed client and assert command parameters.
 */
export function createStorage(
  cfg: Config['s3'],
  client: S3Client = createS3Client(cfg),
): ObjectStorage {
  const { bucket } = cfg;
  return {
    client,
    bucket,

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async getObject(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!res.Body) throw new Error(`Empty body for ${key}`);
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
