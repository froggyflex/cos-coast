import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Miniflare } from "miniflare";
const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("ok")}}',
  d1Databases: { DB: "00000000-0000-4000-8000-000000000000" },
  d1Persist: process.env.LOCAL_DB_PATH ?? ".wrangler/state/v3/d1",
});
try {
  const db = await mf.getD1Database("DB");
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY,hash TEXT NOT NULL)",
    )
    .run();
  for (const name of (await readdir("drizzle"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("drizzle/" + name, "utf8"),
      hash = createHash("sha256").update(sql).digest("hex"),
      old = await db
        .prepare("SELECT hash FROM local_migrations WHERE name=?")
        .bind(name)
        .first();
    if (old) {
      if (old.hash !== hash)
        throw new Error("Previously applied migration changed: " + name);
      continue;
    }
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch([
      ...statements.map((s) => db.prepare(s)),
      db
        .prepare("INSERT INTO local_migrations(name,hash) VALUES (?,?)")
        .bind(name, hash),
    ]);
    console.log("Applied " + name);
  }
} finally {
  await mf.dispose();
}
