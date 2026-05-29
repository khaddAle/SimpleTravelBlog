import { Trip } from '../db/models/Trip.js';

/** Resolve a trip's public shortId to its Mongo ObjectId string, or null. */
export async function tripObjectIdForShortId(shortId: string): Promise<string | null> {
  const trip = await Trip.findOne({ shortId }, { _id: 1 }).lean();
  return trip ? String(trip._id) : null;
}

/** Map a set of Trip ObjectId strings to their shortIds (for DTO output). */
export async function tripShortIdsByObjectId(
  objectIds: string[],
): Promise<Map<string, string>> {
  if (objectIds.length === 0) return new Map();
  const trips = await Trip.find({ _id: { $in: objectIds } }, { shortId: 1 }).lean();
  return new Map(trips.map((t) => [String(t._id), t.shortId]));
}
