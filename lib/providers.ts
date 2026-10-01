import { db, rows, stmt, runtime } from "./db";
// Outbox delivery is at-least-once. Receivers MUST deduplicate Idempotency-Key.
export async function deliver() {
  const env = runtime();
  if (!env.NOTIFICATION_WEBHOOK_URL || !env.NOTIFICATION_WEBHOOK_TOKEN)
    return {
      sent: 0,
      message:
        "Demo mode: notifications remain queued. No email or push was sent.",
    };
  const url = new URL(env.NOTIFICATION_WEBHOOK_URL);
  if (url.protocol !== "https:")
    throw new Error("Notification provider must use HTTPS.");
  await stmt(
    "UPDATE outbox SET status='failed',last_error='Delivery lease expired; safe to retry with the same idempotency key' WHERE status='sending' AND last_attempt_at<?",
    Date.now() - 15 * 60000,
  ).run();
  let sent = 0;
  for (const item of await rows(
    "SELECT * FROM outbox WHERE status IN ('queued','failed') AND attempts<5 ORDER BY created_at LIMIT 20",
  )) {
    const claim = await stmt(
      "UPDATE outbox SET status='sending',attempts=attempts+1,last_attempt_at=? WHERE id=? AND status IN ('queued','failed')",
      Date.now(),
      item.id,
    ).run();
    if (!claim.meta.changes) continue;
    try {
      const res = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.NOTIFICATION_WEBHOOK_TOKEN}`,
          "Idempotency-Key": item.id,
        },
        body: JSON.stringify({
          id: item.id,
          event: item.event,
          ...JSON.parse(item.payload),
        }),
      });
      if (!res.ok) throw new Error(`Provider returned ${res.status}`);
      await stmt(
        "UPDATE outbox SET status='sent',last_error=NULL WHERE id=?",
        item.id,
      ).run();
      sent++;
    } catch (e) {
      await stmt(
        "UPDATE outbox SET status='failed',last_error=? WHERE id=?",
        (e as Error).message.slice(0, 300),
        item.id,
      ).run();
    }
  }
  await db()
    .prepare("DELETE FROM rate_limits WHERE expires_at<?")
    .bind(Date.now())
    .run();
  return {
    sent,
    message: `${sent} notification event(s) delivered to the configured provider.`,
  };
}
