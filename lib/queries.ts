import { collection, collectionName } from "./db";
export async function schedule(exportAll = false) {
  const joins = [
    {
      $lookup: {
        from: collectionName("bookings"),
        localField: "booking_id",
        foreignField: "id",
        as: "booking",
      },
    },
    { $unwind: "$booking" },
    {
      $lookup: {
        from: collectionName("customers"),
        localField: "booking.customer_id",
        foreignField: "id",
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    {
      $lookup: {
        from: collectionName("destinations"),
        localField: "pickup_id",
        foreignField: "id",
        as: "pickup",
      },
    },
    {
      $lookup: {
        from: collectionName("destinations"),
        localField: "dropoff_id",
        foreignField: "id",
        as: "dropoff",
      },
    },
    {
      $lookup: {
        from: collectionName("drivers"),
        localField: "driver_id",
        foreignField: "id",
        as: "driver",
      },
    },
    {
      $lookup: {
        from: collectionName("vehicles"),
        localField: "vehicle_id",
        foreignField: "id",
        as: "vehicle",
      },
    },
    {
      $project: {
        _id: 0,
        id: 1,
        booking_id: 1,
        direction: 1,
        pickup_at: 1,
        operational_status: 1,
        flight_number: 1,
        driver_id: 1,
        vehicle_id: 1,
        reference: "$booking.reference",
        status: "$booking.status",
        payment_status: "$booking.payment_status",
        total_cents: "$booking.total_cents",
        demo: "$booking.demo",
        created_at: "$booking.created_at",
        name: "$customer.name",
        email: "$customer.email",
        phone: "$customer.phone",
        route: {
          $concat: [
            { $arrayElemAt: ["$pickup.name", 0] },
            " → ",
            { $arrayElemAt: ["$dropoff.name", 0] },
          ],
        },
        driver_name: { $arrayElemAt: ["$driver.name", 0] },
        vehicle_name: { $arrayElemAt: ["$vehicle.name", 0] },
      },
    },
  ];
  return (await collection("legs"))
    .aggregate([
      { $sort: { pickup_at: -1 } },
      ...(exportAll ? [] : [{ $limit: 2000 }]),
      ...joins,
    ])
    .toArray();
}
export async function bookingList() {
  const legs = await schedule();
  const result = new Map<string, Record<string, any>>();
  for (const l of legs) {
    const previous = result.get(l.booking_id);
    if (previous) {
      previous.pickup_at = Math.min(previous.pickup_at, l.pickup_at);
      previous.route = l.route + " / " + previous.route;
    } else result.set(l.booking_id, { ...l, id: l.booking_id });
  }
  return [...result.values()].sort((a, b) => b.pickup_at - a.pickup_at);
}
