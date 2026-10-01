import assert from "node:assert/strict";
const base = process.env.TEST_ORIGIN ?? "http://127.0.0.1:5186";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Smoke tests only run against a local demo database.");
let count = 0;
async function req(path, data, expected = 200, auth = false, origin = base) {
  const r = await fetch(base + "/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: origin }),
      ...(auth ? { Cookie: "__sites_local_auth=1" } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const raw = await r.text();
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    p = { error: raw };
  }
  assert.equal(r.status, expected, `${path}: ${JSON.stringify(p)}`);
  count++;
  return p;
}
const local = (n) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(n)
    .replace(" ", "T");
await req("catalog");
await req("admin/bookings", undefined, 401);
await req("quote", {}, 403, false, "https://attacker.invalid");
const journey = {
  type: "airport",
  pickupId: "kgs",
  dropoffId: "kos-town",
  pickupAddress: "",
  dropoffAddress: "Demo hotel, Kos Town",
  dateTime: local(Date.now() + 5 * 86400000),
  returnDateTime: local(Date.now() + 8 * 86400000),
  passengers: 2,
  luggage: 2,
  childSeats: 1,
  flightNumber: "A3 224",
  returnFlightNumber: "",
  arrivalBuffer: 45,
  extras: ["water"],
};
const q = await req("quote", journey);
assert.equal(q.legs.length, 2);
assert.equal(q.legs[0].pickupAt - q.legs[0].scheduledAt, 45 * 60000);
assert.equal(q.options[0].totalCents, 10400);
await req("quote", { ...journey, passengers: 16, luggage: 20 }, 400);
await req("quote", { ...journey, flightNumber: "" }, 400);
await req("quote", { ...journey, dateTime: "2026-10-25T03:30" }, 400);
const payload = {
  journey: { ...journey, vehicleType: "sedan" },
  contact: {
    name: "Alex Demo",
    email: "alex@example.com",
    phone: "+30 0000000000",
    requests: "Demo test booking",
    consent: true,
    marketing: false,
  },
  idempotencyKey: crypto.randomUUID(),
  expectedTotal: q.options[0].totalCents,
};
await req("bookings", { ...payload, expectedTotal: 1 }, 409);
const created = await req("bookings", payload, 201);
const retry = await req("bookings", payload, 201);
assert.equal(created.reference, retry.reference);
await req(
  "bookings",
  { ...payload, contact: { ...payload.contact, name: "Changed Name" } },
  409,
);
await req(
  "lookup",
  { reference: created.reference, email: "wrong@example.com" },
  404,
);
const lookup = await req("lookup", {
  reference: created.reference,
  email: payload.contact.email,
});
assert.equal(lookup.status, "pending");
assert.equal(lookup.legs.length, 2);
assert.equal(lookup.email, undefined);
const list = await req("admin/bookings", undefined, 200, true),
  booking = list.find((b) => b.reference === created.reference);
let b = await req("admin/bookings/" + booking.id, undefined, 200, true);
const edit = (b, status) => ({
  version: b.version,
  status,
  paymentStatus: b.payment_status,
  internalNotes: "Smoke test",
  name: b.name,
  email: b.email,
  phone: b.phone,
  requests: b.requests,
});
await req("admin/bookings/" + b.id, edit(b, "completed"), 400, true);
b = await req("admin/bookings/" + b.id, edit(b, "confirmed"), 200, true);
await req(
  "admin/bookings/" + b.id,
  { ...edit(b, "confirmed"), version: b.version - 1 },
  409,
  true,
);
const dispatch = (b, l) => ({
  version: b.version,
  driverId: "driver-1",
  vehicleId: "car-1",
  pickupTime: local(l.pickup_at),
  operationalStatus: "scheduled",
  flightNumber: l.flight_number,
  pickupAddress: l.pickup_address,
  dropoffAddress: l.dropoff_address,
});
b = await req(
  `admin/bookings/${b.id}/legs/${b.legs[0].id}`,
  dispatch(b, b.legs[0]),
  200,
  true,
);
const second = await req(
  "bookings",
  { ...payload, idempotencyKey: crypto.randomUUID() },
  201,
);
const all = await req("admin/bookings", undefined, 200, true);
let b2 = await req(
  "admin/bookings/" + all.find((x) => x.reference === second.reference).id,
  undefined,
  200,
  true,
);
b2 = await req("admin/bookings/" + b2.id, edit(b2, "confirmed"), 200, true);
await req(
  `admin/bookings/${b2.id}/legs/${b2.legs[0].id}`,
  dispatch(b2, b2.legs[0]),
  409,
  true,
);
const unchanged = await req("admin/bookings/" + b2.id, undefined, 200, true);
assert.equal(
  unchanged.version,
  b2.version,
  "Conflict must roll back version and audit batch",
);
b = await req("admin/bookings/" + b.id, edit(b, "cancelled"), 200, true);
b2 = await req(
  `admin/bookings/${b2.id}/legs/${b2.legs[0].id}`,
  dispatch(b2, b2.legs[0]),
  200,
  true,
);
b2 = await req("admin/bookings/" + b2.id, edit(b2, "cancelled"), 200, true);
const notification = await req("admin/notifications", undefined, 200, true);
assert.ok(notification.notifications.length);
assert.ok(notification.outbox.some((x) => x.status === "queued"));
const provider = await req("admin/deliver", {}, 200, true);
assert.equal(provider.sent, 0);
const csv = await fetch(base + "/api/admin/export", {
  headers: { Cookie: "__sites_local_auth=1" },
});
assert.equal(csv.status, 200);
assert.match(await csv.text(), /reference/);
console.log(
  `PASS: ${count + 1} API checks, round trip quote, arrival buffer, validation, auth/CSRF, idempotency, lookup privacy, state transitions, stale edits, overlap rollback, cancellation release, notifications, demo delivery and CSV. Test bookings retained as cancelled demo records.`,
);
