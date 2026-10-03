import { all, config } from "./db";
import { fromAthens, journeySchema } from "./domain";
import { HttpError } from "./security";
export async function catalog() {
  const [destinations, types, extras, business] = await Promise.all([
    all("destinations", { active: 1 }).then((v) =>
      v.sort((a, b) => a.name.localeCompare(b.name)),
    ),
    all("vehicle_types").then((v) =>
      v.sort((a, b) => a.multiplier - b.multiplier),
    ),
    all("extras", { active: 1 }),
    config(),
  ]);
  return {
    destinations,
    types,
    extras,
    business: business
      ? {
          name: business.name,
          email: business.email,
          phone: business.phone,
          cancellation: business.cancellation,
          privacy: business.privacy,
          arrivalBuffer: business.arrivalBuffer,
          leadMinutes: business.leadMinutes,
          demo: business.demo,
        }
      : null,
  };
}
export async function quote(input: unknown, manual = false) {
  const j = journeySchema.parse(input);
  const c = await catalog();
  const [cfg, routes] = await Promise.all([config(), all("routes")]);
  if (!cfg)
    throw new HttpError(
      503,
      "The service is being configured. Please try again shortly.",
    );
  const pickup = c.destinations.find((d) => d.id === j.pickupId),
    dropoff = c.destinations.find((d) => d.id === j.dropoffId);
  if (!pickup || !dropoff)
    throw new HttpError(400, "Choose an available destination.");
  if (!["airport", "port"].includes(pickup.kind) && !j.pickupAddress)
    throw new HttpError(400, "Add the pickup hotel, villa or street address.");
  if (!["airport", "port"].includes(dropoff.kind) && !j.dropoffAddress)
    throw new HttpError(
      400,
      "Add the drop-off hotel, villa or street address.",
    );
  if (pickup.kind === "airport" && !j.flightNumber)
    throw new HttpError(400, "Add your arriving flight number.");
  if (j.returnDateTime && dropoff.kind === "airport" && !j.returnFlightNumber)
    throw new HttpError(400, "Add your return arriving flight number.");
  const route =
    routes.find(
      (r) => r.from_zone === pickup.zone_id && r.to_zone === dropoff.zone_id,
    ) ||
    routes.find(
      (r) => r.to_zone === pickup.zone_id && r.from_zone === dropoff.zone_id,
    );
  if (!route)
    throw new HttpError(
      400,
      "This route needs a custom quote. Please contact operations.",
    );
  let start: number, back: number | null;
  try {
    start = fromAthens(j.dateTime);
    back = j.returnDateTime ? fromAthens(j.returnDateTime) : null;
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (
    start < Date.now() + (manual ? 0 : cfg.leadMinutes * 60000) ||
    start > Date.now() + 366 * 86400000
  )
    throw new HttpError(
      400,
      `Choose a pickup at least ${manual ? 0 : cfg.leadMinutes} minutes ahead and within the next year.`,
    );
  const leg = (
    direction: string,
    at: number,
    a: any,
    b: any,
    flight: string,
  ) => {
    const buffer = a.kind === "airport" ? j.arrivalBuffer : 0;
    const pickupAt = at + buffer * 60000;
    return {
      direction,
      pickupId: a.id,
      dropoffId: b.id,
      pickupName: a.name,
      dropoffName: b.name,
      scheduledAt: at,
      pickupAt,
      endAt: pickupAt + (route.minutes + cfg.turnaroundMinutes) * 60000,
      arrivalBuffer: buffer,
      flightNumber: flight,
      minutes: route.minutes,
    };
  };
  const legs = [leg("outbound", start, pickup, dropoff, j.flightNumber)];
  if (back) {
    if (back < legs[0].endAt || back > Date.now() + 366 * 86400000)
      throw new HttpError(
        400,
        "Return time must be after the outbound journey and within one year.",
      );
    legs.push(leg("return", back, dropoff, pickup, j.returnFlightNumber));
  }
  const selected = [...new Set(j.extras)].map((id) => {
    const x = c.extras.find((e) => e.id === id);
    if (!x) throw new HttpError(400, "An extra is no longer available.");
    return x;
  });
  const options = c.types
    .filter((t) => t.passengers >= j.passengers && t.luggage >= j.luggage)
    .map((t) => {
      const base = Math.round((route.cents * t.multiplier) / 100);
      const items = [
        {
          label: `${t.name} · ${legs.length} journey${legs.length > 1 ? "s" : ""}`,
          cents: base * legs.length,
        },
        {
          label: `Child seats · ${j.childSeats} per journey`,
          cents: j.childSeats * cfg.childSeatCents * legs.length,
        },
        ...selected.map((e) => ({
          label: `${e.name} · per journey`,
          cents: e.cents * legs.length,
        })),
      ];
      return {
        id: t.id as string,
        name: t.name as string,
        passengers: t.passengers as number,
        luggage: t.luggage as number,
        description: t.description as string,
        totalCents: items.reduce((a, x) => a + x.cents, 0),
        items,
      };
    });
  if (!options.length)
    throw new HttpError(
      400,
      "No vehicle fits this group and luggage. Please contact operations.",
    );
  if (j.vehicleType && !options.some((o) => o.id === j.vehicleType))
    throw new HttpError(
      400,
      "Choose a vehicle with enough passenger and luggage capacity.",
    );
  return {
    journey: j,
    options,
    legs,
    cancellation: cfg.cancellation,
    selectedExtras: selected,
    pricingVersion: cfg.pricingVersion,
    currency: "EUR",
    taxIncluded: true,
  };
}
