import { collection } from "./db";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32000) {
          await reader.cancel();
          throw new HttpError(413, "Request is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
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
  const bucket = Math.floor(Date.now() / 600000);
  // Vercel overwrites x-forwarded-for. Local/self-hosted defaults to one shared bucket.
  const ip = process.env.VERCEL
    ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
    : "local";
  const key = await hash(scope + ":" + ip + ":" + bucket);
  const store = await collection("rate_limits");
  let row;
  try {
    row = await store.findOneAndUpdate(
      { id: key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expires_at: new Date((bucket + 1) * 600000) },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    row = await store.findOneAndUpdate(
      { id: key },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  }
  if (!row || row.count > max)
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
  console.error("Request failed", e instanceof Error ? e.name : "UnknownError");
  return json(
    {
      error:
        "We could not complete this request. Your input is preserved; please try again.",
    },
    500,
  );
}
