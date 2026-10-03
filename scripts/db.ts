import { setupDatabase } from "../lib/setup-db";
import { seed } from "../lib/seed";
import { db, closeDatabase } from "../lib/db";
try {
  await (await db()).command({ ping: 1 });
  if (process.argv[2] === "setup") {
    await setupDatabase();
    console.log(
      "MongoDB connected. Application collections and indexes are ready.",
    );
  } else if (process.argv[2] === "seed") {
    await seed();
    console.log(
      "Demo destinations, pricing, resources and bookings are ready. Existing records preserved.",
    );
  } else throw new Error("Use setup or seed.");
} catch (error) {
  console.error(
    "Database task failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  console.error(
    "Check the connection credentials, Atlas Network Access and database permissions. No credentials were printed.",
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
