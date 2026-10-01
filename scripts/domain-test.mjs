import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
await mkdir(".sites-runtime/tests", { recursive: true });
await build({
  entryPoints: ["lib/domain.ts"],
  outfile: ".sites-runtime/tests/domain.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { fromAthens, localTime, csvCell, bookingSchema } =
  await import("../.sites-runtime/tests/domain.mjs");
assert.equal(
  new Date(fromAthens("2027-01-10T12:00")).toISOString(),
  "2027-01-10T10:00:00.000Z",
);
assert.equal(
  new Date(fromAthens("2027-07-10T12:00")).toISOString(),
  "2027-07-10T09:00:00.000Z",
);
assert.throws(() => fromAthens("2027-03-28T03:30"));
assert.throws(() => fromAthens("2026-10-25T03:30"));
assert.throws(() => fromAthens("2027-02-30T12:00"));
assert.equal(localTime(fromAthens("2027-07-10T12:00")), "2027-07-10T12:00");
assert.ok(csvCell("=SUM(1,2)").startsWith("\"'"));
assert.equal(csvCell('a"b'), '"a""b"');
assert.equal(bookingSchema.safeParse({}).success, false);
console.log(
  "PASS: 9 domain checks (Athens summer/winter, DST gaps/ambiguities, invalid dates, CSV formula escaping, validation).",
);
