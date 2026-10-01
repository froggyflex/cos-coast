import { bookingSchema, transitions, operations, fromAthens } from "./domain";
import { quote } from "./quote";
import { db, rows, one, stmt, config } from "./db";
import { hash, HttpError } from "./security";
import { z } from "zod";
const uid = () => crypto.randomUUID();
export async function createBooking(
  input: unknown,
  actor = "customer",
  manual = false,
) {
  const p = bookingSchema.parse(input);
  const fingerprint = await hash(JSON.stringify(p));
  const existing = await one(
    "SELECT reference,status,request_hash,total_cents FROM bookings WHERE idempotency_key=?",
    p.idempotencyKey,
  );
  if (existing) {
    if (existing.request_hash !== fingerprint)
      throw new HttpError(
        409,
        "This submission changed. Refresh the quote and submit a new request.",
      );
    return {
      reference: existing.reference,
      status: existing.status,
      totalCents: existing.total_cents,
    };
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
  const savedQuote = {
    ...chosen,
    cancellation: q.cancellation,
    pricingVersion: q.pricingVersion,
    currency: "EUR",
    taxIncluded: true,
  };
  const batch = [
    stmt(
      "INSERT INTO customers(id,name,email,phone) VALUES (?,?,?,?)",
      customerId,
      p.contact.name,
      p.contact.email,
      p.contact.phone,
    ),
    stmt(
      "INSERT INTO bookings(id,reference,idempotency_key,request_hash,customer_id,type,vehicle_type,passengers,luggage,child_seats,total_cents,quote,requests,consent_at,privacy_version,marketing,created_at,updated_at,updated_by,mutation_id,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      reference,
      p.idempotencyKey,
      fingerprint,
      customerId,
      p.journey.type,
      chosen.id,
      p.journey.passengers,
      p.journey.luggage,
      p.journey.childSeats,
      chosen.totalCents,
      JSON.stringify(savedQuote),
      p.contact.requests,
      now,
      "2026-10-01",
      p.contact.marketing ? 1 : 0,
      now,
      now,
      actor,
      uid(),
      cfg.demo ? 1 : 0,
    ),
    ...q.legs.map((l) =>
      stmt(
        "INSERT INTO legs(id,booking_id,direction,pickup_id,dropoff_id,pickup_address,dropoff_address,scheduled_at,pickup_at,end_at,flight_number,arrival_buffer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        uid(),
        id,
        l.direction,
        l.pickupId,
        l.dropoffId,
        l.direction === "outbound"
          ? p.journey.pickupAddress
          : p.journey.dropoffAddress,
        l.direction === "outbound"
          ? p.journey.dropoffAddress
          : p.journey.pickupAddress,
        l.scheduledAt,
        l.pickupAt,
        l.endAt,
        l.flightNumber,
        l.arrivalBuffer,
      ),
    ),
    ...q.selectedExtras.map((e) =>
      stmt(
        "INSERT INTO booking_extras(id,booking_id,extra_id,cents) VALUES (?,?,?,?)",
        uid(),
        id,
        e.id,
        e.cents * q.legs.length,
      ),
    ),
    stmt(
      "INSERT INTO notifications(id,booking_id,message,created_at) VALUES (?,?,?,?)",
      uid(),
      id,
      `New request ${reference}`,
      now,
    ),
    stmt(
      "INSERT INTO outbox(id,booking_id,event,payload,created_at) VALUES (?,?,?,?,?)",
      uid(),
      id,
      "booking.requested",
      JSON.stringify({
        reference,
        customerEmail: p.contact.email,
        customerName: p.contact.name,
        recipients: cfg.notificationRecipients,
        totalCents: chosen.totalCents,
        legs: q.legs,
        status: "pending",
        demo: !!cfg.demo,
      }),
      now,
    ),
    stmt(
      "INSERT INTO audit(booking_id,actor,action,details,created_at) VALUES (?,?,?,?,?)",
      id,
      actor,
      "created",
      "Request received; privacy notice accepted; manual payment",
      now,
    ),
  ];
  try {
    await db().batch(batch);
  } catch (e) {
    const retry = await one(
      "SELECT reference,status,total_cents,request_hash FROM bookings WHERE idempotency_key=?",
      p.idempotencyKey,
    );
    if (retry && retry.request_hash === fingerprint)
      return {
        reference: retry.reference,
        status: retry.status,
        totalCents: retry.total_cents,
      };
    throw e;
  }
  return {
    reference,
    status: "pending",
    totalCents: chosen.totalCents,
    demo: !!cfg.demo,
  };
}
export async function detail(id: string): Promise<Record<string, any>> {
  const b = await one(
    "SELECT b.*,c.name,c.email,c.phone FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=?",
    id,
  );
  if (!b) throw new HttpError(404, "Booking not found.");
  return {
    ...b,
    quote: JSON.parse(b.quote),
    legs: await rows(
      "SELECT l.*,p.name pickup_name,d.name dropoff_name FROM legs l JOIN destinations p ON p.id=l.pickup_id JOIN destinations d ON d.id=l.dropoff_id WHERE booking_id=? ORDER BY pickup_at",
      id,
    ),
    audit: await rows(
      "SELECT * FROM audit WHERE booking_id=? ORDER BY id DESC LIMIT 100",
      id,
    ),
  };
}
const editSchema = z.object({
  version: z.number().int(),
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
  phone: z.string().min(7).max(25),
  requests: z.string().max(2000),
});
export async function editBooking(id: string, input: unknown, actor: string) {
  const p = editSchema.parse(input),
    b = await detail(id),
    now = Date.now(),
    mutation = uid();
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
  const changed = p.status !== b.status;
  const batch = [
    stmt(
      "UPDATE bookings SET status=?,payment_status=?,internal_notes=?,requests=?,updated_at=?,updated_by=?,version=version+1,mutation_id=? WHERE id=? AND version=?",
      p.status,
      p.paymentStatus,
      p.internalNotes,
      p.requests,
      now,
      actor,
      mutation,
      id,
      p.version,
    ),
    stmt(
      "UPDATE customers SET name=?,email=?,phone=? WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND mutation_id=?)",
      p.name,
      p.email.toLowerCase(),
      p.phone,
      b.customer_id,
      id,
      mutation,
    ),
    stmt(
      "INSERT INTO audit(booking_id,actor,action,details,created_at) SELECT id,?,?,?,? FROM bookings WHERE id=? AND mutation_id=?",
      actor,
      "updated",
      JSON.stringify({
        status: [b.status, p.status],
        payment: [b.payment_status, p.paymentStatus],
        contactChanged:
          p.name !== b.name || p.email !== b.email || p.phone !== b.phone,
        notesChanged: p.internalNotes !== b.internal_notes,
        requestsChanged: p.requests !== b.requests,
      }),
      now,
      id,
      mutation,
    ),
  ];
  if (changed) {
    batch.push(
      stmt(
        "INSERT INTO notifications(id,booking_id,message,created_at) SELECT ?,id,?,? FROM bookings WHERE id=? AND mutation_id=?",
        uid(),
        `${b.reference} is ${p.status}`,
        now,
        id,
        mutation,
      ),
    );
    batch.push(
      stmt(
        "INSERT INTO outbox(id,booking_id,event,payload,created_at) SELECT ?,id,?,?,? FROM bookings WHERE id=? AND mutation_id=?",
        uid(),
        "booking.status_changed",
        JSON.stringify({
          reference: b.reference,
          status: p.status,
          customerEmail: p.email,
          recipients: (await config()).notificationRecipients,
        }),
        now,
        id,
        mutation,
      ),
    );
  }
  const result = await db().batch(batch);
  if (!result[0].meta.changes)
    throw new HttpError(
      409,
      "Booking changed while saving. Reload and try again.",
    );
  return detail(id);
}
const legSchema = z.object({
  version: z.number().int(),
  driverId: z.string().nullable(),
  vehicleId: z.string().nullable(),
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
  const p = legSchema.parse(input),
    b = await detail(id),
    l = b.legs.find((x: any) => x.id === legId);
  if (!l) throw new HttpError(404, "Journey not found.");
  if (["cancelled", "completed"].includes(b.status))
    throw new HttpError(400, "This booking is closed.");
  if (!["confirmed", "assigned"].includes(b.status))
    throw new HttpError(400, "Confirm the booking before dispatching.");
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
  if (p.driverId) {
    const d = await one(
        "SELECT id FROM drivers WHERE id=? AND active=1",
        p.driverId,
      ),
      v = await one(
        "SELECT * FROM vehicles WHERE id=? AND active=1",
        p.vehicleId,
      );
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
  const mutation = uid(),
    now = Date.now();
  const result = await db().batch([
    stmt(
      "UPDATE bookings SET version=version+1,updated_at=?,updated_by=?,mutation_id=? WHERE id=? AND version=?",
      now,
      actor,
      mutation,
      id,
      p.version,
    ),
    stmt(
      "UPDATE legs SET driver_id=?,vehicle_id=?,pickup_at=?,end_at=?,operational_status=?,flight_number=?,pickup_address=?,dropoff_address=? WHERE id=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND mutation_id=?)",
      p.driverId,
      p.vehicleId,
      pickup,
      end,
      p.operationalStatus,
      p.flightNumber,
      p.pickupAddress,
      p.dropoffAddress,
      legId,
      id,
      mutation,
    ),
    stmt(
      "INSERT INTO audit(booking_id,actor,action,details,created_at) SELECT id,?,?,?,? FROM bookings WHERE id=? AND mutation_id=?",
      actor,
      "journey_updated",
      JSON.stringify({
        leg: legId,
        driver: [l.driver_id, p.driverId],
        vehicle: [l.vehicle_id, p.vehicleId],
        pickup: [l.pickup_at, pickup],
        operationalStatus: [l.operational_status, p.operationalStatus],
      }),
      now,
      id,
      mutation,
    ),
    stmt(
      "INSERT INTO notifications(id,booking_id,message,created_at) SELECT ?,id,?,? FROM bookings WHERE id=? AND mutation_id=?",
      uid(),
      `${b.reference}: ${l.direction} ${p.operationalStatus}`,
      now,
      id,
      mutation,
    ),
    stmt(
      "INSERT INTO outbox(id,booking_id,event,payload,created_at) SELECT ?,id,?,?,? FROM bookings WHERE id=? AND mutation_id=?",
      uid(),
      "journey.updated",
      JSON.stringify({
        reference: b.reference,
        direction: l.direction,
        pickupAt: pickup,
        operationalStatus: p.operationalStatus,
        customerEmail: b.email,
        recipients: (await config()).notificationRecipients,
      }),
      now,
      id,
      mutation,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HttpError(
      409,
      "Booking changed while saving. Reload and try again.",
    );
  return detail(id);
}
