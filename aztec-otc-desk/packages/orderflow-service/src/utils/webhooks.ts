export async function postWebhook(event: string, payload: any) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, payload, ts: Date.now() }),
    });
    if (!res.ok) {
      console.error("Webhook failed", res.status);
    }
  } catch (e) {
    console.error("Webhook error", (e as Error).message);
  }
}
