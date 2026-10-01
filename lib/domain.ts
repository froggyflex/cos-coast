import { z } from "zod";
export const EUR = (c: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(c / 100);
export const athens = (n: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(n);
export const localTime = (n: number) =>
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
export function fromAthens(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid date and time.");
  const base = Date.parse(value + "Z");
  const matches = [base - 120 * 60000, base - 180 * 60000].filter(
    (n) => Number.isFinite(n) && localTime(n) === value,
  );
  if (matches.length !== 1)
    throw new Error(
      "This time is skipped or repeated by daylight saving. Please choose another time or contact operations.",
    );
  return matches[0];
}
export const journeySchema = z
  .object({
    type: z.enum(["airport", "port", "hotel", "private", "business"]),
    pickupId: z.string().min(1).max(80),
    dropoffId: z.string().min(1).max(80),
    pickupAddress: z.string().trim().max(300).default(""),
    dropoffAddress: z.string().trim().max(300).default(""),
    dateTime: z.string(),
    returnDateTime: z.string().optional().default(""),
    passengers: z.coerce.number().int().min(1).max(16),
    luggage: z.coerce.number().int().min(0).max(20),
    childSeats: z.coerce.number().int().min(0).max(4),
    flightNumber: z.string().trim().max(30).default(""),
    returnFlightNumber: z.string().trim().max(30).default(""),
    arrivalBuffer: z.coerce.number().int().min(15).max(180).default(45),
    extras: z.array(z.string().max(80)).max(8).default([]),
    vehicleType: z.string().max(80).optional(),
  })
  .refine((d) => d.pickupId !== d.dropoffId, {
    message: "Choose two different destinations.",
    path: ["dropoffId"],
  })
  .refine((d) => d.childSeats <= d.passengers, {
    message: "Child seats cannot exceed the passenger count.",
    path: ["childSeats"],
  });
export const bookingSchema = z.object({
  journey: journeySchema,
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .trim()
      .regex(
        /^\+?[0-9 ()-]{7,25}$/,
        "Enter a valid phone number including country code.",
      ),
    requests: z.string().trim().max(2000).default(""),
    consent: z.literal(true),
    marketing: z.boolean().default(false),
  }),
  idempotencyKey: z.string().uuid(),
  expectedTotal: z.number().int().nonnegative(),
});
export type Journey = z.infer<typeof journeySchema>;
export const transitions: Record<string, string[]> = {
  new: ["pending", "confirmed", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["confirmed", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export const operations: Record<string, string[]> = {
  unassigned: ["scheduled"],
  scheduled: ["en_route", "unassigned"],
  en_route: ["arrived"],
  arrived: ["on_board", "no_show"],
  on_board: ["completed"],
  completed: [],
  no_show: [],
};
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
