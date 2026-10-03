import { admin } from "@/lib/admin-auth";
import { z } from "zod";
import { catalog, quote } from "@/lib/quote";
import {
  createBooking,
  detail,
  editBooking,
  editLeg,
  journeyDetails,
} from "@/lib/bookings";
import { body, json, failure, HttpError, limit } from "@/lib/security";
import { all, one, collection, config } from "@/lib/db";
import { deliver } from "@/lib/providers";
import { seed } from "@/lib/seed";
import { saveSettings } from "@/lib/settings";
import { bookingList, schedule } from "@/lib/queries";
import { csvCell } from "@/lib/domain";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean).slice(1),
      method = req.method;
    if (parts.length === 1 && parts[0] === "catalog" && method === "GET")
      return json(await catalog());
    if (parts.length === 1 && parts[0] === "quote" && method === "POST") {
      const p = await body(req);
      await limit(req, "quote", 100);
      return json(await quote(p));
    }
    if (parts.length === 1 && parts[0] === "bookings" && method === "POST") {
      const p = await body(req);
      await limit(req, "booking", 15);
      return json(await createBooking(p), 201);
    }
    if (parts.length === 1 && parts[0] === "lookup" && method === "POST") {
      const p = z
        .object({
          reference: z.string().trim().max(40),
          email: z.string().trim().email().max(200),
        })
        .parse(await body(req));
      await limit(req, "lookup", 15);
      const b = await one("bookings", { reference: p.reference.toUpperCase() });
      const customer =
        b &&
        (await one("customers", {
          id: b.customer_id,
          email: p.email.toLowerCase(),
        }));
      if (!b || !customer)
        throw new HttpError(
          404,
          "No matching booking was found. Check the reference and email.",
        );
      return json({
        reference: b.reference,
        status: b.status,
        payment_status: b.payment_status,
        total_cents: b.total_cents,
        quote: b.quote,
        demo: b.demo,
        legs: (await journeyDetails(b.id)).map((l) => ({
          direction: l.direction,
          pickup_at: l.pickup_at,
          operational_status: l.operational_status,
          pickup_name: l.pickup_name,
          dropoff_name: l.dropoff_name,
        })),
      });
    }
    if (parts[0] !== "admin") throw new HttpError(404, "Not found.");
    const user = await admin(),
      p = method === "POST" ? await body(req) : null;
    const action = parts.slice(1).join("/");
    if (action === "schedule" && method === "GET")
      return json(await schedule());
    if (action === "quote" && method === "POST")
      return json(await quote(p, true));
    if (action === "seed" && method === "POST") {
      await seed();
      return json({ ok: true });
    }
    if (action === "bookings")
      return method === "POST"
        ? json(await createBooking(p, user.email, true), 201)
        : json(await bookingList());
    if (parts[1] === "bookings" && parts[2]) {
      if (parts.length === 5 && parts[3] === "legs" && method === "POST")
        return json(await editLeg(parts[2], parts[4], p, user.email));
      if (parts.length === 3)
        return json(
          method === "POST"
            ? await editBooking(parts[2], p, user.email)
            : await detail(parts[2]),
        );
    }
    if (action === "resources" && method === "GET")
      return json({
        drivers: await all("drivers"),
        vehicles: await all("vehicles"),
        types: await all("vehicle_types"),
      });
    if (action === "notifications") {
      if (method === "POST") {
        await (
          await collection("notifications")
        ).updateMany({ read_at: null }, { $set: { read_at: Date.now() } });
        return json({ ok: true });
      }
      return json({
        notifications: await (
          await collection("notifications")
        )
          .find({}, { projection: { _id: 0 } })
          .sort({ created_at: -1 })
          .limit(100)
          .toArray(),
        outbox: await (
          await collection("outbox")
        )
          .find(
            {},
            {
              projection: {
                _id: 0,
                id: 1,
                event: 1,
                status: 1,
                attempts: 1,
                last_error: 1,
                created_at: 1,
              },
            },
          )
          .sort({ created_at: -1 })
          .limit(100)
          .toArray(),
      });
    }
    if (action === "deliver" && method === "POST") return json(await deliver());
    if (action === "settings") {
      if (method === "POST") return json(await saveSettings(p, user.email));
      return json({
        business: await config(),
        zones: await all("zones"),
        destinations: await all("destinations"),
        routes: await all("routes"),
        extras: await all("extras"),
        drivers: await all("drivers"),
        vehicles: await all("vehicles"),
        types: await all("vehicle_types"),
      });
    }
    if (action === "export" && method === "GET") {
      const list = await schedule(true);
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
