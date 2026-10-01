import { env } from "cloudflare:workers";
export const runtime = () =>
  env as unknown as {
    DB: D1Database;
    ADMIN_EMAILS?: string;
    NOTIFICATION_WEBHOOK_URL?: string;
    NOTIFICATION_WEBHOOK_TOKEN?: string;
    SEED_ENABLED?: string;
    PUBLIC_ORIGIN?: string;
  };
export function db() {
  const d = runtime().DB;
  if (!d) throw new Error("Database is not configured.");
  return d;
}
export async function rows<T = Record<string, any>>(
  sql: string,
  ...values: any[]
): Promise<T[]> {
  return (
    await db()
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;
}
export async function one<T = Record<string, any>>(
  sql: string,
  ...values: any[]
): Promise<T | null> {
  return db()
    .prepare(sql)
    .bind(...values)
    .first<T>();
}
export const stmt = (sql: string, ...values: any[]) =>
  db()
    .prepare(sql)
    .bind(...values);
export async function config() {
  return JSON.parse(
    (await one("SELECT value FROM settings WHERE id=?", "business"))?.value ??
      "null",
  );
}
