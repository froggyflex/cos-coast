import { db, collection, collectionName, collectionNames } from "./db";
// Version 1: repeatable, additive setup. No collection or customer data is dropped.
export async function setupDatabase() {
  const database = await db();
  for (const name of collectionNames) {
    const exists = await database
      .listCollections({ name: collectionName(name) }, { nameOnly: true })
      .hasNext();
    if (!exists)
      await database.createCollection(collectionName(name), {
        validator: {
          $jsonSchema: {
            bsonType: "object",
            required: ["id"],
            properties: { id: { bsonType: "string" } },
          },
        },
      });
    await (await collection(name)).createIndex({ id: 1 }, { unique: true });
  }
  await (
    await collection("bookings")
  ).createIndexes([
    { key: { reference: 1 }, unique: true },
    { key: { idempotency_key: 1 }, unique: true },
    { key: { created_at: -1 } },
    { key: { status: 1, created_at: -1 } },
    { key: { customer_id: 1 } },
  ]);
  await (
    await collection("legs")
  ).createIndexes([
    { key: { booking_id: 1, pickup_at: 1 } },
    { key: { pickup_at: -1 } },
    {
      key: { driver_id: 1, pickup_at: 1, end_at: 1 },
      partialFilterExpression: { reserving: true },
    },
    {
      key: { vehicle_id: 1, pickup_at: 1, end_at: 1 },
      partialFilterExpression: { reserving: true },
    },
  ]);
  await (await collection("routes")).createIndex({ pair: 1 }, { unique: true });
  await (
    await collection("vehicles")
  ).createIndex({ plate: 1 }, { unique: true });
  await (await collection("customers")).createIndex({ email: 1 });
  await (await collection("outbox")).createIndex({ status: 1, created_at: 1 });
  await (
    await collection("audit")
  ).createIndex({ booking_id: 1, created_at: -1 });
  await (await collection("notifications")).createIndex({ created_at: -1 });
  await (
    await collection("rate_limits")
  ).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await (
    await collection("locks")
  ).updateOne(
    { id: "dispatch" },
    { $setOnInsert: { version: 0 } },
    { upsert: true },
  );
  await (
    await collection("settings")
  ).updateOne({ id: "schema" }, { $set: { version: 1 } }, { upsert: true });
}
