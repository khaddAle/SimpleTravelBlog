import mongoose from 'mongoose';

/**
 * Connect the default mongoose connection. `autoIndex` is enabled outside
 * production so indexes are built on boot; in production indexes are managed
 * deliberately (built once) to avoid surprise foreground builds.
 */
export async function connectMongo(
  uri: string,
  opts: { autoIndex?: boolean } = {},
): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    autoIndex: opts.autoIndex ?? true,
    serverSelectionTimeoutMS: 5_000,
  });
  return mongoose;
}

export function disconnectMongo(): Promise<void> {
  return mongoose.disconnect();
}
