import { z } from "zod";
import { collection, one, transaction, lockSchedule } from "./db";
import { HttpError } from "./security";
const str = z.string().trim().min(1).max(300),
  id = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  active = z.coerce.number().int().min(0).max(1),
  money = z.coerce.number().int().min(0).max(10000000);
export async function saveSettings(p: any, actor: string) {
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
    await transaction(async (session) => {
      await lockSchedule(session);
      await (
        await collection("settings")
      ).updateOne(
        { id: "business" },
        { $set: { value: { ...v, pricingVersion: Date.now() } } },
        { upsert: true, session },
      );
      await (
        await collection("audit")
      ).insertOne(
        {
          id: crypto.randomUUID(),
          actor,
          action: "settings_updated",
          details: "business",
          created_at: Date.now(),
        },
        { session },
      );
    });
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
    v = rule.schema.parse(p.value) as Record<string, any> & { id: string };
  await transaction(async (session) => {
    await lockSchedule(session);
    if (
      entity === "destinations" &&
      !(await one("zones", { id: v.zone_id }, session))
    )
      throw new HttpError(400, "Choose an existing zone.");
    if (entity === "routes") {
      for (const zone of [v.from_zone, v.to_zone])
        if (!(await one("zones", { id: zone }, session)))
          throw new HttpError(400, "Choose existing zones.");
      v.pair = [v.from_zone, v.to_zone].sort().join(":");
      const duplicate = await one(
        "routes",
        { pair: v.pair, id: { $ne: v.id } },
        session,
      );
      if (duplicate)
        throw new HttpError(
          409,
          "This route already exists. Edit the existing route.",
        );
    }
    if (entity === "vehicles") {
      if (!(await one("vehicle_types", { id: v.type_id }, session)))
        throw new HttpError(400, "Choose an existing vehicle class.");
      const duplicate = await one(
        "vehicles",
        { plate: v.plate, id: { $ne: v.id } },
        session,
      );
      if (duplicate)
        throw new HttpError(409, "This registration plate is already in use.");
      const current = await one("vehicles", { id: v.id }, session);
      if (
        current &&
        (v.active === 0 || current.type_id !== v.type_id) &&
        (await one("legs", { vehicle_id: v.id, reserving: true }, session))
      )
        throw new HttpError(
          409,
          "Reassign scheduled journeys before changing this vehicle's availability or class.",
        );
    }
    if (
      entity === "drivers" &&
      v.active === 0 &&
      (await one("legs", { driver_id: v.id, reserving: true }, session))
    )
      throw new HttpError(
        409,
        "Reassign scheduled journeys before disabling this driver.",
      );
    await (
      await collection(rule.table)
    ).updateOne({ id: v.id }, { $set: v }, { upsert: true, session });
    await (
      await collection("settings")
    ).updateOne(
      { id: "business" },
      { $set: { "value.pricingVersion": Date.now() } },
      { session },
    );
    await (
      await collection("audit")
    ).insertOne(
      {
        id: crypto.randomUUID(),
        actor,
        action: "settings_updated",
        details: JSON.stringify({ entity, id: v.id }),
        created_at: Date.now(),
      },
      { session },
    );
  });
  return { ok: true };
}
