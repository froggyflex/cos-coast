import { db, stmt, runtime } from "./db";
// Explicit, idempotent demo seed; never run schema changes at request time.
export async function seed() {
  if (runtime().SEED_ENABLED !== "true")
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
    email: "admin@example.com",
    phone: "",
    cancellation:
      "Demo policy: request cancellation at least 24 hours before pickup for no charge. Later requests require operator review. No automatic charge or refund is made.",
    privacy:
      "We use contact and journey details to handle your transfer request. Contact admin@example.com for access or deletion requests. No advertising cookies are used. Replace this demo notice with your approved privacy policy before launch.",
    leadMinutes: 120,
    turnaroundMinutes: 30,
    childSeatCents: 500,
    arrivalBuffer: 45,
    pricingVersion: 1,
    notificationRecipients: ["admin@example.com"],
    demo: true,
  };
  const batch = [
    ...zones.map((x) =>
      stmt("INSERT OR IGNORE INTO zones(id,name) VALUES (?,?)", ...x),
    ),
    ...destinations.map((x) =>
      stmt(
        "INSERT OR IGNORE INTO destinations(id,name,zone_id,kind) VALUES (?,?,?,?)",
        ...x,
      ),
    ),
    ...types.map((x) =>
      stmt(
        "INSERT OR IGNORE INTO vehicle_types(id,name,passengers,luggage,multiplier,description) VALUES (?,?,?,?,?,?)",
        ...x,
      ),
    ),
    stmt(
      "INSERT OR IGNORE INTO settings(id,value) VALUES (?,?)",
      "business",
      JSON.stringify(business),
    ),
  ];
  zones.forEach((a, i) =>
    zones
      .slice(i)
      .forEach((b, k) =>
        batch.push(
          stmt(
            "INSERT OR IGNORE INTO routes(id,from_zone,to_zone,cents,minutes) VALUES (?,?,?,?,?)",
            a[0] + "-" + b[0],
            a[0],
            b[0],
            i === 0
              ? [2000, 4500, 3500, 3000, 4000][k]
              : i === i + k
                ? 2000
                : 3500 + k * 500,
            i === i + k ? 15 : 25 + k * 8,
          ),
        ),
      ),
  );
  for (const x of [
    ["water", "Bottled water", 200],
    ["meet", "Personalised welcome sign", 500],
  ])
    batch.push(
      stmt("INSERT OR IGNORE INTO extras(id,name,cents) VALUES (?,?,?)", ...x),
    );
  for (const x of [
    ["driver-1", "Nikos · demo", "+30 0000000000"],
    ["driver-2", "Maria · demo", "+30 0000000000"],
  ])
    batch.push(
      stmt("INSERT OR IGNORE INTO drivers(id,name,phone) VALUES (?,?,?)", ...x),
    );
  for (const x of [
    ["car-1", "Comfort sedan · demo", "DEMO-001", "sedan"],
    ["car-2", "Executive car · demo", "DEMO-002", "executive"],
    ["van-1", "Private minivan · demo", "DEMO-003", "van"],
    ["bus-1", "Group minibus · demo", "DEMO-004", "minibus"],
  ])
    batch.push(
      stmt(
        "INSERT OR IGNORE INTO vehicles(id,name,plate,type_id) VALUES (?,?,?,?)",
        ...x,
      ),
    );
  const now = Date.now();
  for (const [i, name, status] of [
    [1, "Alex Morgan · demo", "pending"],
    [2, "Sofia Taylor · demo", "confirmed"],
    [3, "Jamie Lee · demo", "new"],
  ] as const) {
    const id = `sample-${i}`,
      at = now + (i + 1) * 86400000;
    const q = {
      name: "Comfort sedan",
      items: [{ label: "Comfort sedan · 1 journey", cents: 4500 }],
      totalCents: 4500,
      currency: "EUR",
      taxIncluded: true,
      cancellation: business.cancellation,
      pricingVersion: 1,
    };
    batch.push(
      stmt(
        "INSERT OR IGNORE INTO customers(id,name,email,phone) VALUES (?,?,?,?)",
        id,
        name,
        `guest${i}@example.com`,
        "+30 0000000000",
      ),
      stmt(
        "INSERT OR IGNORE INTO bookings(id,reference,idempotency_key,request_hash,customer_id,type,vehicle_type,passengers,luggage,child_seats,status,total_cents,quote,requests,consent_at,privacy_version,created_at,updated_at,updated_by,mutation_id,demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        `KOS-DEMO-000${i}`,
        id,
        "demo",
        id,
        "airport",
        "sedan",
        2,
        2,
        0,
        status,
        4500,
        JSON.stringify(q),
        "Fictional seed record",
        now,
        "2026-10-01",
        now,
        now,
        "demo seed",
        id,
        1,
      ),
      stmt(
        "INSERT OR IGNORE INTO legs(id,booking_id,direction,pickup_id,dropoff_id,pickup_address,dropoff_address,scheduled_at,pickup_at,end_at,flight_number,arrival_buffer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        id,
        "outbound",
        "kgs",
        "kos-town",
        "Airport arrivals",
        "Demo Seaside Hotel",
        at,
        at + 45 * 60000,
        at + 108 * 60000,
        "DEMO 123",
        45,
      ),
      stmt(
        "INSERT OR IGNORE INTO notifications(id,booking_id,message,created_at) VALUES (?,?,?,?)",
        id,
        id,
        `Demo request KOS-DEMO-000${i}`,
        now,
      ),
    );
  }
  await db().batch(batch);
}
