import assert from "node:assert/strict";
import {
  collection,
  collectionNames,
  collectionName,
  closeDatabase,
  db,
  one,
  transaction,
} from "../lib/db";
import { setupDatabase } from "../lib/setup-db";
import { seed } from "../lib/seed";
import { quote } from "../lib/quote";
import { createBooking, detail, editBooking, editLeg } from "../lib/bookings";
import { saveSettings } from "../lib/settings";
import { localTime } from "../lib/domain";
import { allowGoogleAccount } from "../lib/access";
import { body, limit, HttpError } from "../lib/security";
import { bookingList, schedule } from "../lib/queries";
import { deliver } from "../lib/providers";

// A new, exclusively owned namespace; cleanup never touches application data.
const prefix = "test_" + crypto.randomUUID().replaceAll("-", "") + "_";
process.env.MONGODB_COLLECTION_PREFIX = prefix;
process.env.SEED_ENABLED = "true";
delete process.env.NOTIFICATION_WEBHOOK_URL;
delete process.env.NOTIFICATION_WEBHOOK_TOKEN;
const actor = "integration-test";
let checks = 0;
function ok(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks++;
}
async function rejects(fn: () => Promise<unknown>, status: number) {
  await assert.rejects(
    fn,
    (e) => e instanceof HttpError && e.status === status,
  );
  checks++;
}
function bookingEdit(b: Record<string, any>, status = b.status) {
  return {
    version: b.version,
    status,
    paymentStatus: b.payment_status,
    internalNotes: b.internal_notes,
    name: b.name,
    email: b.email,
    phone: b.phone,
    requests: b.requests,
  };
}
function legEdit(
  b: Record<string, any>,
  driverId = "driver-1",
  vehicleId = "car-1",
) {
  const l = b.legs[0];
  return {
    version: b.version,
    driverId,
    vehicleId,
    pickupTime: localTime(l.pickup_at),
    operationalStatus: "scheduled",
    flightNumber: l.flight_number,
    pickupAddress: l.pickup_address,
    dropoffAddress: l.dropoff_address,
  };
}
try {
  await setupDatabase();
  await seed();
  await seed();
  ok(
    (await (await collection("bookings")).countDocuments()) === 3,
    "Seed is idempotent",
  );
  const j = {
    type: "airport",
    pickupId: "kgs",
    dropoffId: "kos-town",
    pickupAddress: "Airport arrivals",
    dropoffAddress: "Test Hotel",
    dateTime: localTime(Date.now() + 20 * 86400000).slice(0, 11) + "12:00",
    returnDateTime: "",
    passengers: 2,
    luggage: 2,
    childSeats: 1,
    flightNumber: "TEST 123",
    returnFlightNumber: "",
    arrivalBuffer: 45,
    extras: ["water"],
    vehicleType: "sedan",
  };
  const q = await quote(j);
  ok(
    q.options[0].totalCents === 5200,
    "Data-driven quote includes seats and extras",
  );
  ok(
    q.legs[0].pickupAt - q.legs[0].scheduledAt === 45 * 60000,
    "Flight arrival buffer applied",
  );
  const back = await quote({
    ...j,
    returnDateTime: localTime(Date.now() + 22 * 86400000),
  });
  ok(
    back.options[0].totalCents === 10400 &&
      back.legs.length === 2 &&
      back.legs[1].arrivalBuffer === 0,
    "Return pricing and directional airport buffer",
  );
  await rejects(() => quote({ ...j, flightNumber: "" }), 400);
  await rejects(() => quote({ ...j, passengers: 4 }), 400);
  await rejects(
    () => quote({ ...j, dateTime: localTime(Date.now() - 86400000) }),
    400,
  );
  const p = {
    journey: j,
    contact: {
      name: "Test Customer",
      email: "test@example.com",
      phone: "+30 1234567890",
      requests: "Fictional test",
      consent: true,
      marketing: false,
    },
    idempotencyKey: crypto.randomUUID(),
    expectedTotal: 5200,
  };
  await rejects(() => createBooking({ ...p, expectedTotal: 1 }), 409);
  const simultaneous = await Promise.all([createBooking(p), createBooking(p)]);
  ok(
    simultaneous[0].reference === simultaneous[1].reference,
    "Concurrent idempotency produces one booking",
  );
  ok(
    (await (await collection("bookings")).countDocuments()) === 4,
    "Only one booking committed",
  );
  ok(
    (await (await collection("outbox")).countDocuments()) === 1,
    "Only one confirmation event committed",
  );
  await rejects(
    () => createBooking({ ...p, contact: { ...p.contact, name: "Changed" } }),
    409,
  );
  const saved = await one("bookings", { reference: simultaneous[0].reference });
  let b = await detail(saved!.id);
  ok(
    b.quote.totalCents === 5200 && b.legs.length === 1 && b.audit.length === 1,
    "Detail includes saved quote, journey and audit",
  );
  await rejects(() => editLeg(b.id, b.legs[0].id, legEdit(b), actor), 400);
  b = await editBooking(b.id, bookingEdit(b, "confirmed"), actor);
  await rejects(
    () =>
      editBooking(b.id, { ...bookingEdit(b), version: b.version - 1 }, actor),
    409,
  );
  await rejects(
    () => editBooking(b.id, bookingEdit(b, "assigned"), actor),
    400,
  );
  const second = await createBooking({
    ...p,
    idempotencyKey: crypto.randomUUID(),
  });
  const secondSaved = await one("bookings", { reference: second.reference });
  let b2 = await detail(secondSaved!.id);
  b2 = await editBooking(b2.id, bookingEdit(b2, "confirmed"), actor);
  const before = await (await collection("audit")).countDocuments();
  const race = await Promise.allSettled([
    editLeg(b.id, b.legs[0].id, legEdit(b), actor),
    editLeg(b2.id, b2.legs[0].id, legEdit(b2), actor),
  ]);
  ok(
    race.filter((r) => r.status === "fulfilled").length === 1,
    "Concurrent resource conflict allows exactly one assignment",
  );
  const failure = race.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  ok(failure.reason.status === 409, "Losing assignment returns a conflict");
  ok(
    (await (await collection("audit")).countDocuments()) === before + 1,
    "Conflicting transaction has no audit side effect",
  );
  const winning = (
    race.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Record<string, any>
    >
  ).value;
  const loser = await detail(winning.id === b.id ? b2.id : b.id);
  await rejects(
    () =>
      editLeg(
        loser.id,
        loser.legs[0].id,
        legEdit(loser, "driver-2", "car-1"),
        actor,
      ),
    409,
  );
  await (
    await collection("vehicles")
  ).insertOne({
    id: "car-test",
    name: "Test",
    plate: "TEST-ONLY",
    type_id: "sedan",
    active: 1,
  });
  await rejects(
    () =>
      editLeg(
        loser.id,
        loser.legs[0].id,
        legEdit(loser, "driver-1", "car-test"),
        actor,
      ),
    409,
  );
  await rejects(
    () =>
      saveSettings(
        {
          entity: "drivers",
          value: {
            id: "driver-1",
            name: "Nikos",
            phone: "+30 0000000000",
            active: 0,
          },
        },
        actor,
      ),
    409,
  );
  await editBooking(winning.id, bookingEdit(winning, "cancelled"), actor);
  const released = await editLeg(
    loser.id,
    loser.legs[0].id,
    legEdit(loser),
    actor,
  );
  ok(
    released.legs[0].driver_id === "driver-1",
    "Cancellation releases availability",
  );
  let operational = await editBooking(
    released.id,
    bookingEdit(released, "assigned"),
    actor,
  );
  await rejects(
    () =>
      editBooking(operational.id, bookingEdit(operational, "completed"), actor),
    400,
  );
  for (const step of ["en_route", "arrived", "on_board", "completed"])
    operational = await editLeg(
      operational.id,
      operational.legs[0].id,
      { ...legEdit(operational), operationalStatus: step },
      actor,
    );
  operational = await editBooking(
    operational.id,
    { ...bookingEdit(operational, "completed"), paymentStatus: "paid" },
    actor,
  );
  ok(
    operational.status === "completed" && operational.payment_status === "paid",
    "Full dispatch and payment workflow",
  );
  await rejects(
    () =>
      editLeg(
        operational.id,
        operational.legs[0].id,
        legEdit(operational),
        actor,
      ),
    400,
  );
  await assert.rejects(() =>
    transaction(async (session) => {
      await (
        await collection("customers")
      ).insertOne({ id: "rollback" }, { session });
      throw new Error("intentional rollback");
    }),
  );
  ok(
    !(await one("customers", { id: "rollback" })),
    "Transaction rolls back partial writes",
  );
  ok(
    (await bookingList()).length === 5 && (await schedule(true)).length === 5,
    "Operations list, schedule and export joins",
  );
  ok((await deliver()).sent === 0, "No external provider invented");
  const req = new Request("http://localhost:3000/api/quote", {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  await rejects(() => body(req), 403);
  await limit(new Request("http://localhost"), "test", 1);
  await rejects(() => limit(new Request("http://localhost"), "test", 1), 429);
  const email = process.env.ADMIN_EMAILS!.split(",")[0];
  ok(
    allowGoogleAccount("google", { email, email_verified: true }),
    "Allowed verified Google account accepted",
  );
  ok(
    !allowGoogleAccount("google", { email, email_verified: false }),
    "Unverified Google account denied",
  );
  ok(
    !allowGoogleAccount("google", {
      email: "intruder@example.com",
      email_verified: true,
    }),
    "Other Google accounts denied",
  );
  ok(
    !allowGoogleAccount("credentials", { email, email_verified: true }),
    "Untrusted provider denied",
  );
  console.log(
    `PASS: ${checks} Atlas integration checks, including concurrent assignments, rollback and Google access rules.`,
  );
} catch (error) {
  console.error(
    "Integration checks failed:",
    error instanceof assert.AssertionError
      ? error.message
      : error instanceof HttpError
        ? `${error.status}: ${error.message}`
        : error instanceof Error
          ? error.name
          : "UnknownError",
  );
  process.exitCode = 1;
} finally {
  if (
    !/^test_[a-f0-9]{32}_$/.test(prefix) ||
    process.env.MONGODB_COLLECTION_PREFIX !== prefix
  )
    throw new Error("Unsafe cleanup namespace");
  const database = await db();
  for (const name of collectionNames) {
    const exactName = collectionName(name);
    if (!exactName.startsWith(prefix))
      throw new Error("Unsafe collection cleanup");
    await database.dropCollection(exactName).catch((error) => {
      if (error.code !== 26) throw error;
    });
  }
  await closeDatabase();
}
