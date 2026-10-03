import {
  MongoClient,
  type ClientSession,
  type Filter,
  type Document,
} from "mongodb";

export const runtime = () => process.env;
const globalMongo = globalThis as typeof globalThis & {
  kosMongo?: Promise<MongoClient>;
};
export async function client() {
  if (!globalMongo.kosMongo) {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MongoDB is not configured.");
    globalMongo.kosMongo = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    })
      .connect()
      .catch((error) => {
        globalMongo.kosMongo = undefined;
        throw error;
      });
  }
  return globalMongo.kosMongo;
}
export async function db() {
  return (await client()).db(process.env.MONGODB_DB || "coscoast");
}
export const collectionNames = [
  "zones",
  "destinations",
  "vehicle_types",
  "routes",
  "extras",
  "drivers",
  "vehicles",
  "customers",
  "bookings",
  "legs",
  "booking_extras",
  "notifications",
  "outbox",
  "audit",
  "settings",
  "rate_limits",
  "locks",
] as const;
export type CollectionName = (typeof collectionNames)[number];
export function collectionName(name: CollectionName) {
  const prefix = process.env.MONGODB_COLLECTION_PREFIX || "transfer_";
  if (!/^[a-zA-Z0-9_]{1,60}$/.test(prefix))
    throw new Error("Invalid collection prefix.");
  return prefix + name;
}
export async function collection(name: CollectionName) {
  return (await db()).collection<Document & { id: string; [key: string]: any }>(
    collectionName(name),
  );
}
export async function all(
  name: CollectionName,
  filter: Filter<Document> = {},
  session?: ClientSession,
) {
  return (await collection(name))
    .find(filter, { session, projection: { _id: 0 } })
    .toArray();
}
export async function one(
  name: CollectionName,
  filter: Filter<Document>,
  session?: ClientSession,
) {
  return (await collection(name)).findOne(filter, {
    session,
    projection: { _id: 0 },
  });
}
export async function config(session?: ClientSession) {
  return (await one("settings", { id: "business" }, session))?.value ?? null;
}
export async function transaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = (await client()).startSession();
  try {
    return await session.withTransaction(() => fn(session), {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: 10000,
    });
  } finally {
    await session.endSession();
  }
}
// The first write in every dispatch transaction serializes availability changes.
// Snapshot reads alone would permit two concurrent bookings to reserve one car.
export async function lockSchedule(session: ClientSession) {
  const result = await (
    await collection("locks")
  ).updateOne({ id: "dispatch" }, { $inc: { version: 1 } }, { session });
  if (!result.matchedCount)
    throw new Error("Run npm run db:setup before accepting bookings.");
}
export async function closeDatabase() {
  if (globalMongo.kosMongo) await (await globalMongo.kosMongo).close();
  globalMongo.kosMongo = undefined;
}
