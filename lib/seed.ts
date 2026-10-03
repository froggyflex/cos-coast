import { collection, transaction } from "./db";
import type { CollectionName } from "./db";
export async function seed() {
  if (process.env.SEED_ENABLED !== "true")
    throw new Error("Demo seeding is disabled.");
  const zones = [
    ["airport", "Airport & Antimachia"],
    ["town", "Kos Town & Psalidi"],
    ["north", "Tigaki & Marmari"],
    ["south", "Kardamena"],
    ["west", "Kefalos & Mastichari"],
  ];
  const destinations = [
    ["kgs", "Kos Airport (KGS)", "airport", "airport"],
    ["kos-port", "Kos Ferry Port", "town", "port"],
    ["kos-town", "Kos Town", "town", "hotel"],
    ["psalidi", "Psalidi", "town", "hotel"],
    ["tigaki", "Tigaki", "north", "hotel"],
    ["marmari", "Marmari", "north", "hotel"],
    ["kardamena", "Kardamena", "south", "hotel"],
    ["kefalos", "Kefalos", "west", "hotel"],
    ["mastichari", "Mastichari", "west", "hotel"],
    ["mastichari-port", "Mastichari Port", "west", "port"],
  ];
  const types = [
    [
      "sedan",
      "Comfort sedan",
      3,
      3,
      100,
      "A relaxed private ride for couples and small groups.",
    ],
    [
      "executive",
      "Executive car",
      3,
      3,
      145,
      "Premium comfort for business and special occasions.",
    ],
    [
      "van",
      "Private minivan",
      8,
      8,
      165,
      "Extra room for families, friends and everything you bring.",
    ],
    [
      "minibus",
      "Group minibus",
      16,
      16,
      260,
      "Travel together, from airport arrivals to island days out.",
    ],
  ];
  const business = {
    name: "Kos Coast Transfers",
    email: "andrea.tallaros7@gmail.com",
    phone: "",
    cancellation:
      "Demo policy: request cancellation at least 24 hours before pickup for no charge. Later requests require operator review. No automatic charge or refund is made.",
    privacy:
      "We use contact and journey details to handle your transfer request. Contact andrea.tallaros7@gmail.com for access or deletion requests. No advertising cookies are used. Replace this demo notice with your approved privacy policy before launch.",
    leadMinutes: 120,
    turnaroundMinutes: 30,
    childSeatCents: 500,
    arrivalBuffer: 45,
    pricingVersion: 1,
    notificationRecipients: ["andrea.tallaros7@gmail.com"],
    demo: true,
  };

  await transaction(async (session) => {
    async function put(
      name: CollectionName,
      value: Record<string, any> & { id: string },
    ) {
      await (
        await collection(name)
      ).updateOne(
        { id: value.id },
        { $setOnInsert: value },
        { upsert: true, session },
      );
    }
    for (const [id, name] of zones) await put("zones", { id, name });
    for (const [id, name, zone_id, kind] of destinations)
      await put("destinations", { id, name, zone_id, kind, active: 1 });
    for (const [
      id,
      name,
      passengers,
      luggage,
      multiplier,
      description,
    ] of types)
      await put("vehicle_types", {
        id: String(id),
        name,
        passengers,
        luggage,
        multiplier,
        description,
      });
    await put("settings", { id: "business", value: business });
    for (let i = 0; i < zones.length; i++)
      for (let j = i; j < zones.length; j++) {
        const from_zone = zones[i][0],
          to_zone = zones[j][0],
          k = j - i;
        await put("routes", {
          id: from_zone + "-" + to_zone,
          from_zone,
          to_zone,
          pair: [from_zone, to_zone].sort().join(":"),
          cents:
            i === 0
              ? [2000, 4500, 3500, 3000, 4000][k]
              : k === 0
                ? 2000
                : 3500 + k * 500,
          minutes: k === 0 ? 15 : 25 + k * 8,
        });
      }
    for (const [id, name, cents] of [
      ["water", "Bottled water", 200],
      ["meet", "Personalised welcome sign", 500],
    ])
      await put("extras", { id: String(id), name, cents, active: 1 });
    for (const [id, name] of [
      ["driver-1", "Nikos · demo"],
      ["driver-2", "Maria · demo"],
    ])
      await put("drivers", { id, name, phone: "+30 0000000000", active: 1 });
    for (const [id, name, plate, type_id] of [
      ["car-1", "Comfort sedan · demo", "DEMO-001", "sedan"],
      ["car-2", "Executive car · demo", "DEMO-002", "executive"],
      ["van-1", "Private minivan · demo", "DEMO-003", "van"],
      ["bus-1", "Group minibus · demo", "DEMO-004", "minibus"],
    ])
      await put("vehicles", { id, name, plate, type_id, active: 1 });
    const now = Date.now();
    for (const [i, name, status] of [
      [1, "Alex Morgan · demo", "pending"],
      [2, "Sofia Taylor · demo", "confirmed"],
      [3, "Jamie Lee · demo", "new"],
    ] as const) {
      const id = "sample-" + i,
        at = now + (i + 1) * 86400000,
        reference = "KOS-DEMO-000" + i;
      await put("customers", {
        id,
        name,
        email: "guest" + i + "@example.com",
        phone: "+30 0000000000",
      });
      await put("bookings", {
        id,
        reference,
        idempotency_key: id,
        request_hash: "demo",
        customer_id: id,
        type: "airport",
        vehicle_type: "sedan",
        passengers: 2,
        luggage: 2,
        child_seats: 0,
        status,
        payment_status: "unpaid",
        total_cents: 4500,
        quote: {
          id: "sedan",
          name: "Comfort sedan",
          items: [{ label: "Comfort sedan · 1 journey", cents: 4500 }],
          totalCents: 4500,
          currency: "EUR",
          taxIncluded: true,
          cancellation: business.cancellation,
          pricingVersion: 1,
        },
        requests: "Fictional seed record",
        internal_notes: "",
        consent_at: now,
        privacy_version: "2026-10-01",
        marketing: 0,
        created_at: now,
        updated_at: now,
        updated_by: "demo seed",
        version: 1,
        demo: 1,
      });
      await put("legs", {
        id,
        booking_id: id,
        direction: "outbound",
        pickup_id: "kgs",
        dropoff_id: "kos-town",
        pickup_address: "Airport arrivals",
        dropoff_address: "Demo Seaside Hotel",
        scheduled_at: at,
        pickup_at: at + 45 * 60000,
        end_at: at + 108 * 60000,
        flight_number: "DEMO 123",
        arrival_buffer: 45,
        driver_id: null,
        vehicle_id: null,
        operational_status: "unassigned",
        reserving: false,
      });
      await put("notifications", {
        id,
        booking_id: id,
        message: "Demo request " + reference,
        created_at: now,
        read_at: null,
      });
    }
  });
}
