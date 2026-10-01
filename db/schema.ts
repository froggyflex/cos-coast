import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const zones = sqliteTable("zones", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const destinations = sqliteTable("destinations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zoneId: text("zone_id")
    .notNull()
    .references(() => zones.id),
  kind: text("kind").notNull(),
  active: integer("active").notNull().default(1),
});
export const vehicleTypes = sqliteTable("vehicle_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  passengers: integer("passengers").notNull(),
  luggage: integer("luggage").notNull(),
  multiplier: integer("multiplier").notNull(),
  description: text("description").notNull(),
});
export const routes = sqliteTable(
  "routes",
  {
    id: text("id").primaryKey(),
    fromZone: text("from_zone")
      .notNull()
      .references(() => zones.id),
    toZone: text("to_zone")
      .notNull()
      .references(() => zones.id),
    cents: integer("cents").notNull(),
    minutes: integer("minutes").notNull(),
  },
  (t) => [uniqueIndex("route_pair").on(t.fromZone, t.toZone)],
);
export const extras = sqliteTable("extras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cents: integer("cents").notNull(),
  active: integer("active").notNull().default(1),
});
export const drivers = sqliteTable("drivers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  active: integer("active").notNull().default(1),
});
export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plate: text("plate").notNull(),
  typeId: text("type_id")
    .notNull()
    .references(() => vehicleTypes.id),
  active: integer("active").notNull().default(1),
});
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
  },
  (t) => [index("customer_email").on(t.email)],
);
export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    requestHash: text("request_hash").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    type: text("type").notNull(),
    vehicleType: text("vehicle_type")
      .notNull()
      .references(() => vehicleTypes.id),
    passengers: integer("passengers").notNull(),
    luggage: integer("luggage").notNull(),
    childSeats: integer("child_seats").notNull(),
    status: text("status").notNull().default("pending"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    totalCents: integer("total_cents").notNull(),
    quote: text("quote").notNull(),
    requests: text("requests").notNull().default(""),
    internalNotes: text("internal_notes").notNull().default(""),
    consentAt: integer("consent_at").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    marketing: integer("marketing").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
    version: integer("version").notNull().default(1),
    mutationId: text("mutation_id").notNull(),
    demo: integer("demo").notNull().default(0),
  },
  (t) => [index("bookings_status_created").on(t.status, t.createdAt)],
);
export const legs = sqliteTable(
  "legs",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    direction: text("direction").notNull(),
    pickupId: text("pickup_id")
      .notNull()
      .references(() => destinations.id),
    dropoffId: text("dropoff_id")
      .notNull()
      .references(() => destinations.id),
    pickupAddress: text("pickup_address").notNull(),
    dropoffAddress: text("dropoff_address").notNull(),
    scheduledAt: integer("scheduled_at").notNull(),
    pickupAt: integer("pickup_at").notNull(),
    endAt: integer("end_at").notNull(),
    flightNumber: text("flight_number").notNull().default(""),
    arrivalBuffer: integer("arrival_buffer").notNull().default(0),
    driverId: text("driver_id").references(() => drivers.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id),
    operationalStatus: text("operational_status")
      .notNull()
      .default("unassigned"),
  },
  (t) => [
    index("legs_booking").on(t.bookingId),
    index("legs_pickup").on(t.pickupAt),
    index("legs_driver_time").on(t.driverId, t.pickupAt),
    index("legs_vehicle_time").on(t.vehicleId, t.pickupAt),
  ],
);
export const bookingExtras = sqliteTable("booking_extras", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id),
  extraId: text("extra_id")
    .notNull()
    .references(() => extras.id),
  cents: integer("cents").notNull(),
});
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").references(() => bookings.id),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
  readAt: integer("read_at"),
});
export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    event: text("event").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastAttemptAt: integer("last_attempt_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_status").on(t.status)],
);
export const audit = sqliteTable(
  "audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    details: text("details").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_booking").on(t.bookingId)],
);
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
