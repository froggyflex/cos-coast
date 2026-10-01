import { z } from "zod";
import { catalog, quote } from "@/lib/quote";
import { createBooking, detail, editBooking, editLeg } from "@/lib/bookings";
import { admin, body, json, failure, HttpError, limit } from "@/lib/security";
import { rows, one, stmt, db, config } from "@/lib/db";
import { deliver } from "@/lib/providers";
import { seed } from "@/lib/seed";
import { csvCell } from "@/lib/domain";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean).slice(1),
      method = req.method;
    if (parts[0] === "catalog" && method === "GET")
      return json(await catalog());
    if (parts[0] === "quote" && method === "POST") {
      const p = await body(req);
      await limit(req, "quote", 100);
      return json(await quote(p));
    }
    if (parts[0] === "bookings" && method === "POST") {
      const p = await body(req);
      await limit(req, "booking", 15);
      return json(await createBooking(p), 201);
    }
    if (parts[0] === "lookup" && method === "POST") {
      const p = z
        .object({ reference: z.string().max(40), email: z.string().email() })
        .parse(await body(req));
      await limit(req, "lookup", 15);
      const b = await one(
        "SELECT b.id,b.reference,b.status,b.payment_status,b.total_cents,b.quote,b.demo FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.reference=? AND c.email=?",
        p.reference.trim().toUpperCase(),
        p.email.trim().toLowerCase(),
      );
      if (!b)
        throw new HttpError(
          404,
          "No matching booking was found. Check the reference and email.",
        );
      return json({
        ...b,
        id: undefined,
        quote: JSON.parse(b.quote),
        legs: await rows(
          "SELECT l.direction,l.pickup_at,l.operational_status,p.name pickup_name,d.name dropoff_name FROM legs l JOIN destinations p ON p.id=l.pickup_id JOIN destinations d ON d.id=l.dropoff_id WHERE l.booking_id=? ORDER BY l.pickup_at",
          b.id,
        ),
      });
    }
    if (parts[0] !== "admin") throw new HttpError(404, "Not found.");
    const user = await admin();
    const p = method === "POST" ? await body(req) : null;
    if (parts[1] === "schedule" && method === "GET")
      return json(
        await rows(
          `SELECT l.id,l.booking_id,l.direction,l.pickup_at,l.operational_status,b.reference,b.status,c.name,c.email,p.name || ' → ' || d.name route,dr.name driver_name,v.name vehicle_name FROM legs l JOIN bookings b ON b.id=l.booking_id JOIN customers c ON c.id=b.customer_id JOIN destinations p ON p.id=l.pickup_id JOIN destinations d ON d.id=l.dropoff_id LEFT JOIN drivers dr ON dr.id=l.driver_id LEFT JOIN vehicles v ON v.id=l.vehicle_id ORDER BY l.pickup_at DESC LIMIT 2000`,
        ),
      );
    if (parts[1] === "seed" && method === "POST") {
      await seed();
      return json({ ok: true });
    }
    if (parts[1] === "bookings" && parts.length === 2) {
      if (method === "POST")
        return json(await createBooking(p, user.email, true), 201);
      const list = await rows(
        "SELECT b.id,b.reference,b.status,b.payment_status,b.total_cents,b.created_at,b.demo,c.name,c.email,c.phone,MIN(l.pickup_at) pickup_at,GROUP_CONCAT(p.name || ' → ' || d.name, ' / ') route FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN legs l ON l.booking_id=b.id JOIN destinations p ON p.id=l.pickup_id JOIN destinations d ON d.id=l.dropoff_id GROUP BY b.id ORDER BY pickup_at DESC LIMIT 1000",
      );
      return json(list);
    }
    if (parts[1] === "bookings" && parts[2]) {
      if (parts[3] === "legs" && parts[4] && method === "POST")
        return json(await editLeg(parts[2], parts[4], p, user.email));
      if (method === "POST")
        return json(await editBooking(parts[2], p, user.email));
      return json(await detail(parts[2]));
    }
    if (parts[1] === "resources" && method === "GET")
      return json({
        drivers: await rows("SELECT * FROM drivers"),
        vehicles: await rows("SELECT * FROM vehicles"),
        types: await rows("SELECT * FROM vehicle_types"),
      });
    if (parts[1] === "notifications") {
      if (method === "POST") {
        await stmt(
          "UPDATE notifications SET read_at=? WHERE read_at IS NULL",
          Date.now(),
        ).run();
        return json({ ok: true });
      }
      return json({
        notifications: await rows(
          "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100",
        ),
        outbox: await rows(
          "SELECT id,event,status,attempts,last_error,created_at FROM outbox ORDER BY created_at DESC LIMIT 100",
        ),
      });
    }
    if (parts[1] === "deliver" && method === "POST")
      return json(await deliver());
    if (parts[1] === "settings") {
      if (method === "GET")
        return json({
          business: await config(),
          zones: await rows("SELECT * FROM zones"),
          destinations: await rows("SELECT * FROM destinations"),
          routes: await rows("SELECT * FROM routes"),
          extras: await rows("SELECT * FROM extras"),
          drivers: await rows("SELECT * FROM drivers"),
          vehicles: await rows("SELECT * FROM vehicles"),
          types: await rows("SELECT * FROM vehicle_types"),
        });
      if (method === "POST") return json(await saveSettings(p));
    }
    if (parts[1] === "export" && method === "GET") {
      const list = await rows(
        "SELECT b.reference,b.status,b.payment_status,b.total_cents,c.name,c.email,c.phone,l.direction,l.pickup_at,l.flight_number,l.driver_id,l.vehicle_id FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN legs l ON l.booking_id=b.id ORDER BY l.pickup_at",
      );
      const columns = [
        "reference",
        "status",
        "payment_status",
        "total_cents",
        "name",
        "email",
        "phone",
        "direction",
        "pickup_at",
        "flight_number",
        "driver_id",
        "vehicle_id",
      ];
      return new Response(
        [
          columns.map(csvCell).join(","),
          ...list.map((r) =>
            columns
              .map((k) =>
                csvCell(
                  k === "pickup_at" ? new Date(r[k]).toISOString() : r[k],
                ),
              )
              .join(","),
          ),
        ].join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition": 'attachment; filename="kos-bookings.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
const str = z.string().trim().min(1).max(300),
  id = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  active = z.coerce.number().int().min(0).max(1),
  money = z.coerce.number().int().min(0).max(10000000);
async function saveSettings(p: any) {
  const entity = z
    .enum([
      "business",
      "zones",
      "destinations",
      "routes",
      "extras",
      "drivers",
      "vehicles",
      "types",
    ])
    .parse(p.entity);
  if (entity === "business") {
    const v = z
      .object({
        name: str,
        email: z.string().email(),
        phone: z.string().max(40),
        cancellation: z.string().min(10).max(3000),
        privacy: z.string().min(10).max(5000),
        notificationRecipients: z.array(z.string().email()).min(1).max(10),
        leadMinutes: z.coerce.number().int().min(30).max(10080),
        turnaroundMinutes: z.coerce.number().int().min(0).max(180),
        childSeatCents: money,
        arrivalBuffer: z.coerce.number().int().min(15).max(180),
        demo: z.boolean(),
      })
      .parse(p.value);
    await stmt(
      "INSERT INTO settings(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      "business",
      JSON.stringify({ ...v, pricingVersion: Date.now() }),
    ).run();
    return { ok: true };
  }
  const maps: any = {
    zones: { schema: z.object({ id, name: str }), table: "zones" },
    destinations: {
      schema: z.object({
        id,
        name: str,
        zone_id: id,
        kind: z.enum(["airport", "port", "hotel"]),
        active,
      }),
      table: "destinations",
    },
    routes: {
      schema: z.object({
        id,
        from_zone: id,
        to_zone: id,
        cents: money,
        minutes: z.coerce.number().int().min(5).max(600),
      }),
      table: "routes",
    },
    extras: {
      schema: z.object({ id, name: str, cents: money, active }),
      table: "extras",
    },
    drivers: {
      schema: z.object({ id, name: str, phone: str, active }),
      table: "drivers",
    },
    vehicles: {
      schema: z.object({ id, name: str, plate: str, type_id: id, active }),
      table: "vehicles",
    },
    types: {
      schema: z.object({
        id,
        name: str,
        passengers: z.coerce.number().int().min(1).max(50),
        luggage: z.coerce.number().int().min(0).max(50),
        multiplier: z.coerce.number().int().min(50).max(1000),
        description: str,
      }),
      table: "vehicle_types",
    },
  };
  const rule = maps[entity],
    v = rule.schema.parse(p.value) as Record<string, any>,
    keys = Object.keys(v);
  await stmt(
    `INSERT INTO ${rule.table}(${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
      .filter((k) => k !== "id")
      .map((k) => `${k}=excluded.${k}`)
      .join(",")}`,
    ...keys.map((k) => v[k]),
  ).run();
  return { ok: true };
}
