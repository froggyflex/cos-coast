import { collection, runtime } from "./db";
// At-least-once delivery: receivers must deduplicate the stable Idempotency-Key.
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
  const outbox = await collection("outbox");
  await outbox.updateMany(
    { status: "sending", last_attempt_at: { $lt: Date.now() - 15 * 60000 } },
    {
      $set: {
        status: "failed",
        last_error:
          "Delivery lease expired; retry uses the same idempotency key",
      },
    },
  );
  let sent = 0;
  const attempted = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const lease = crypto.randomUUID();
    const item = await outbox.findOneAndUpdate(
      {
        status: { $in: ["queued", "failed"] },
        attempts: { $lt: 5 },
        id: { $nin: [...attempted] },
        ...(env.NOTIFICATION_SEND_DEMO === "true"
          ? {}
          : { "payload.demo": { $ne: true } }),
      },
      {
        $set: { status: "sending", last_attempt_at: Date.now(), lease },
        $inc: { attempts: 1 },
      },
      { sort: { created_at: 1 }, returnDocument: "after" },
    );
    if (!item) break;
    attempted.add(item.id);
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
          ...item.payload,
        }),
      });
      if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
      await outbox.updateOne(
        { id: item.id, lease },
        { $set: { status: "sent", last_error: null } },
      );
      sent++;
    } catch (e) {
      const message =
        e instanceof Error && e.message.startsWith("Provider returned HTTP ")
          ? e.message
          : "Provider unavailable or timed out. Retry later.";
      await outbox.updateOne(
        { id: item.id, lease },
        { $set: { status: "failed", last_error: message } },
      );
    }
  }
  return {
    sent,
    message: `${sent} notification event(s) delivered to the configured provider. Demo events are held unless explicitly enabled.`,
  };
}
