import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db, runtime } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function admin() {
  const u = await getChatGPTUser();
  if (!u) throw new HttpError(401, "Sign in to access operations.");
  const allowed = (runtime().ADMIN_EMAILS ?? "admin@example.com")
    .split(",")
    .map((x) => x.trim().toLowerCase());
  if (!allowed.includes(u.email.toLowerCase()))
    throw new HttpError(
      403,
      "This account is not on the operations allowlist. Configure ADMIN_EMAILS with your real sign-in email.",
    );
  return u;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new HttpError(403, "Request origin not allowed.");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Use application/json.");
}
export async function body(req: Request) {
  sameOrigin(req);
  if (Number(req.headers.get("content-length") ?? 0) > 32000)
    throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (text.length > 32000) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON request.");
  }
}
export async function hash(value: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(b), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function limit(req: Request, scope: string, max = 25) {
  await db()
    .prepare("DELETE FROM rate_limits WHERE expires_at<?")
    .bind(Date.now())
    .run();
  const bucket = Math.floor(Date.now() / 600000);
  const key = await hash(
    `${scope}:${req.headers.get("cf-connecting-ip") ?? "local"}:${bucket}`,
  );
  const row = await db()
    .prepare(
      "INSERT INTO rate_limits(id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(key, Date.now() + 600000)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max)
    throw new HttpError(
      429,
      "Too many attempts. Please try again in ten minutes.",
    );
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
export function failure(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e && typeof e === "object" && "issues" in e)
    return json(
      {
        error: (e as any).issues
          .map((i: any) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      },
      400,
    );
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("ASSIGNMENT_CONFLICT"))
    return json(
      { error: "Driver or vehicle is already booked in this time window." },
      409,
    );
  console.error("Request failed", e);
  return json(
    {
      error:
        "We could not complete this request. Your input is preserved; please try again.",
    },
    500,
  );
}
