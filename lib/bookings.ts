import { bookingSchema, transitions, operations, fromAthens } from "./domain";
import { quote } from "./quote";
import { collection, all, one, config, transaction, lockSchedule } from "./db";
import { hash, HttpError } from "./security";
import type { ClientSession } from "mongodb";
import { z } from "zod";
const uid = () => crypto.randomUUID();
const result = (b: Record<string, any>) => ({
  reference: b.reference,
  status: b.status,
  totalCents: b.total_cents,
  demo: !!b.demo,
});
async function event(
  bookingId: string,
  name: string,
  message: string,
  payload: Record<string, any>,
  session: ClientSession,
) {
  const now = Date.now();
  await (
    await collection("notifications")
  ).insertOne(
    {
      id: uid(),
      booking_id: bookingId,
      message,
      created_at: now,
      read_at: null,
    },
    { session },
  );
  await (
    await collection("outbox")
  ).insertOne(
    {
      id: uid(),
      booking_id: bookingId,
      event: name,
      payload,
      status: "queued",
      attempts: 0,
      last_error: null,
      last_attempt_at: null,
      created_at: now,
    },
    { session },
  );
}
async function audit(
  bookingId: string,
  actor: string,
  action: string,
  details: unknown,
  session: ClientSession,
) {
  await (
    await collection("audit")
  ).insertOne(
    {
      id: uid(),
      booking_id: bookingId,
      actor,
      action,
      details: JSON.stringify(details),
      created_at: Date.now(),
    },
    { session },
  );
}
export async function createBooking(
  input: unknown,
  actor = "customer",
  manual = false,
) {
  const p = bookingSchema.parse(input);
  const fingerprint = await hash(JSON.stringify(p));
  const existing = await one("bookings", { idempotency_key: p.idempotencyKey });
  if (existing) {
    if (existing.request_hash !== fingerprint)
      throw new HttpError(
        409,
        "This submission changed. Refresh the quote and submit a new request.",
      );
    return result(existing);
  }
  const q = await quote(p.journey, manual);
  const chosen = q.options.find((o) => o.id === p.journey.vehicleType);
  if (!chosen) throw new HttpError(400, "Choose a vehicle.");
  if (chosen.totalCents !== p.expectedTotal)
    throw new HttpError(
      409,
      "The price changed. Return to vehicle selection to review the updated quote.",
    );
  const id = uid(),
    customerId = uid(),
    reference = "KOS-" + uid().replaceAll("-", "").slice(0, 16).toUpperCase(),
    now = Date.now(),
    cfg = await config();
  const booking = {
    id,
    reference,
    idempotency_key: p.idempotencyKey,
    request_hash: fingerprint,
    customer_id: customerId,
    type: p.journey.type,
    vehicle_type: chosen.id,
    passengers: p.journey.passengers,
    luggage: p.journey.luggage,
    child_seats: p.journey.childSeats,
    status: "pending",
    payment_status: "unpaid",
    total_cents: chosen.totalCents,
    quote: {
      ...chosen,
      cancellation: q.cancellation,
      pricingVersion: q.pricingVersion,
      currency: "EUR",
      taxIncluded: true,
    },
    requests: p.contact.requests,
    internal_notes: "",
    consent_at: now,
    privacy_version: "2026-10-01",
    marketing: p.contact.marketing ? 1 : 0,
    created_at: now,
    updated_at: now,
    updated_by: actor,
    version: 1,
    demo: cfg.demo ? 1 : 0,
  };
  try {
    await transaction(async (session) => {
      await (
        await collection("customers")
      ).insertOne(
        {
          id: customerId,
          name: p.contact.name,
          email: p.contact.email,
          phone: p.contact.phone,
        },
        { session },
      );
      await (await collection("bookings")).insertOne(booking, { session });
      await (
        await collection("legs")
      ).insertMany(
        q.legs.map((l) => ({
          id: uid(),
          booking_id: id,
          direction: l.direction,
          pickup_id: l.pickupId,
          dropoff_id: l.dropoffId,
          pickup_address:
            l.direction === "outbound"
              ? p.journey.pickupAddress
              : p.journey.dropoffAddress,
          dropoff_address:
            l.direction === "outbound"
              ? p.journey.dropoffAddress
              : p.journey.pickupAddress,
          scheduled_at: l.scheduledAt,
          pickup_at: l.pickupAt,
          end_at: l.endAt,
          flight_number: l.flightNumber,
          arrival_buffer: l.arrivalBuffer,
          driver_id: null,
          vehicle_id: null,
          operational_status: "unassigned",
          reserving: false,
        })),
        { session },
      );
      if (q.selectedExtras.length)
        await (
          await collection("booking_extras")
        ).insertMany(
          q.selectedExtras.map((e) => ({
            id: uid(),
            booking_id: id,
            extra_id: e.id,
            cents: e.cents * q.legs.length,
          })),
          { session },
        );
      await event(
        id,
        "booking.requested",
        `New request ${reference}`,
        {
          reference,
          customerEmail: p.contact.email,
          customerName: p.contact.name,
          recipients: cfg.notificationRecipients,
          totalCents: chosen.totalCents,
          legs: q.legs,
          status: "pending",
          demo: !!cfg.demo,
        },
        session,
      );
      await audit(
        id,
        actor,
        "created",
        "Request received; privacy notice accepted; manual payment",
        session,
      );
    });
  } catch (e) {
    const retry = await one("bookings", { idempotency_key: p.idempotencyKey });
    if (retry?.request_hash === fingerprint) return result(retry);
    if (retry)
      throw new HttpError(
        409,
        "This submission changed. Use a new booking request.",
      );
    throw e;
  }
  return result(booking);
}
export async function journeyDetails(
  bookingId: string,
  session?: ClientSession,
): Promise<Record<string, any>[]> {
  const legs = await all("legs", { booking_id: bookingId }, session);
  const destinations = await all("destinations", {}, session);
  return legs
    .sort((a, b) => a.pickup_at - b.pickup_at)
    .map((l) => ({
      ...l,
      pickup_name:
        destinations.find((d) => d.id === l.pickup_id)?.name || l.pickup_id,
      dropoff_name:
        destinations.find((d) => d.id === l.dropoff_id)?.name || l.dropoff_id,
    }));
}
export async function detail(
  id: string,
  session?: ClientSession,
): Promise<Record<string, any>> {
  const b = await one("bookings", { id }, session);
  if (!b) throw new HttpError(404, "Booking not found.");
  const c = await one("customers", { id: b.customer_id }, session);
  const legs = await journeyDetails(id, session);
  const log = await (
    await collection("audit")
  )
    .find({ booking_id: id }, { session, projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  return {
    ...b,
    name: c?.name,
    email: c?.email,
    phone: c?.phone,
    legs,
    audit: log,
  };
}
const editSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum([
    "new",
    "pending",
    "confirmed",
    "assigned",
    "completed",
    "cancelled",
  ]),
  paymentStatus: z.enum([
    "unpaid",
    "deposit_paid",
    "paid",
    "refund_pending",
    "refunded",
  ]),
  internalNotes: z.string().max(5000),
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(200),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,25}$/),
  requests: z.string().max(2000),
});
export async function editBooking(id: string, input: unknown, actor: string) {
  const p = editSchema.parse(input);
  await transaction(async (session) => {
    await lockSchedule(session);
    const b = await detail(id, session);
    if (b.version !== p.version)
      throw new HttpError(
        409,
        "Someone updated this booking. Reload before saving.",
      );
    if (p.status !== b.status && !transitions[b.status]?.includes(p.status))
      throw new HttpError(400, "This status transition is not allowed.");
    if (
      p.status === "assigned" &&
      b.legs.some((l: any) => !l.driver_id || !l.vehicle_id)
    )
      throw new HttpError(
        400,
        "Assign a driver and vehicle to every journey first.",
      );
    if (
      p.status === "completed" &&
      b.legs.some((l: any) => l.operational_status !== "completed")
    )
      throw new HttpError(400, "Complete every journey first.");
    await (
      await collection("bookings")
    ).updateOne(
      { id, version: p.version },
      {
        $set: {
          status: p.status,
          payment_status: p.paymentStatus,
          internal_notes: p.internalNotes,
          requests: p.requests,
          updated_at: Date.now(),
          updated_by: actor,
        },
        $inc: { version: 1 },
      },
      { session },
    );
    await (
      await collection("customers")
    ).updateOne(
      { id: b.customer_id },
      { $set: { name: p.name, email: p.email.toLowerCase(), phone: p.phone } },
      { session },
    );
    if (["cancelled", "completed"].includes(p.status))
      await (
        await collection("legs")
      ).updateMany(
        { booking_id: id },
        { $set: { reserving: false } },
        { session },
      );
    await audit(
      id,
      actor,
      "updated",
      {
        status: [b.status, p.status],
        payment: [b.payment_status, p.paymentStatus],
        contactChanged:
          p.name !== b.name || p.email !== b.email || p.phone !== b.phone,
        notesChanged: p.internalNotes !== b.internal_notes,
        requestsChanged: p.requests !== b.requests,
      },
      session,
    );
    if (p.status !== b.status)
      await event(
        id,
        "booking.status_changed",
        `${b.reference} is ${p.status}`,
        {
          reference: b.reference,
          status: p.status,
          customerEmail: p.email,
          recipients: (await config(session)).notificationRecipients,
          demo: !!b.demo,
        },
        session,
      );
  });
  return detail(id);
}
const legSchema = z.object({
  version: z.number().int().positive(),
  driverId: z.string().max(80).nullable(),
  vehicleId: z.string().max(80).nullable(),
  pickupTime: z.string(),
  operationalStatus: z.enum([
    "unassigned",
    "scheduled",
    "en_route",
    "arrived",
    "on_board",
    "completed",
    "no_show",
  ]),
  flightNumber: z.string().max(30),
  pickupAddress: z.string().max(300),
  dropoffAddress: z.string().max(300),
});
export async function editLeg(
  id: string,
  legId: string,
  input: unknown,
  actor: string,
) {
  const p = legSchema.parse(input);
  await transaction(async (session) => {
    await lockSchedule(session);
    const b = await detail(id, session),
      l = b.legs.find((x: any) => x.id === legId);
    if (!l) throw new HttpError(404, "Journey not found.");
    if (!["confirmed", "assigned"].includes(b.status))
      throw new HttpError(
        400,
        "Confirm the booking before dispatching; closed bookings cannot be dispatched.",
      );
    if (b.version !== p.version)
      throw new HttpError(409, "Booking changed. Reload first.");
    if (
      p.operationalStatus !== l.operational_status &&
      !operations[l.operational_status]?.includes(p.operationalStatus)
    )
      throw new HttpError(400, "Follow the next operational step.");
    if (p.operationalStatus !== "unassigned" && (!p.driverId || !p.vehicleId))
      throw new HttpError(400, "A driver and vehicle are required.");
    if (!!p.driverId !== !!p.vehicleId)
      throw new HttpError(400, "Assign both a driver and vehicle.");
    if (
      b.status === "assigned" &&
      (!p.driverId || p.operationalStatus === "unassigned")
    )
      throw new HttpError(
        400,
        "Change the booking back to confirmed before removing its assignment.",
      );
    if (p.driverId && p.operationalStatus === "unassigned")
      throw new HttpError(
        400,
        "Choose scheduled when assigning a driver and vehicle.",
      );
    if (["completed", "no_show"].includes(l.operational_status))
      throw new HttpError(400, "This journey is closed.");
    if (p.driverId) {
      const d = await one("drivers", { id: p.driverId, active: 1 }, session),
        v = await one("vehicles", { id: p.vehicleId, active: 1 }, session);
      if (!d || !v || v.type_id !== b.vehicle_type)
        throw new HttpError(
          400,
          "Use an active driver and a vehicle of the booked class.",
        );
    }
    let pickup: number;
    try {
      pickup = fromAthens(p.pickupTime);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const end = pickup + (l.end_at - l.pickup_at);
    if (
      b.legs.some(
        (other: any) =>
          other.id !== legId && pickup < other.end_at && end > other.pickup_at,
      )
    )
      throw new HttpError(
        409,
        "This time overlaps another leg of the same booking.",
      );
    const reserving =
      !!p.driverId &&
      !["completed", "no_show", "unassigned"].includes(p.operationalStatus);
    if (
      reserving &&
      (await one(
        "legs",
        {
          id: { $ne: legId },
          reserving: true,
          pickup_at: { $lt: end },
          end_at: { $gt: pickup },
          $or: [{ driver_id: p.driverId }, { vehicle_id: p.vehicleId }],
        },
        session,
      ))
    )
      throw new HttpError(
        409,
        "Driver or vehicle is already booked in this time window.",
      );
    await (
      await collection("bookings")
    ).updateOne(
      { id, version: p.version },
      {
        $inc: { version: 1 },
        $set: { updated_at: Date.now(), updated_by: actor },
      },
      { session },
    );
    await (
      await collection("legs")
    ).updateOne(
      { id: legId },
      {
        $set: {
          driver_id: p.driverId,
          vehicle_id: p.vehicleId,
          pickup_at: pickup,
          end_at: end,
          operational_status: p.operationalStatus,
          flight_number: p.flightNumber,
          pickup_address: p.pickupAddress,
          dropoff_address: p.dropoffAddress,
          reserving,
        },
      },
      { session },
    );
    await audit(
      id,
      actor,
      "journey_updated",
      {
        leg: legId,
        driver: [l.driver_id, p.driverId],
        vehicle: [l.vehicle_id, p.vehicleId],
        pickup: [l.pickup_at, pickup],
        operationalStatus: [l.operational_status, p.operationalStatus],
      },
      session,
    );
    await event(
      id,
      "journey.updated",
      `${b.reference}: ${l.direction} ${p.operationalStatus}`,
      {
        reference: b.reference,
        direction: l.direction,
        pickupAt: pickup,
        operationalStatus: p.operationalStatus,
        customerEmail: b.email,
        recipients: (await config(session)).notificationRecipients,
        demo: !!b.demo,
      },
      session,
    );
  });
  return detail(id);
}
