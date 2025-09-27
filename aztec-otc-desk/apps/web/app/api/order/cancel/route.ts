import "server-only";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return new Response("Missing orderId", { status: 400 });

    const api =
      process.env.OTC_API_URL ||
      process.env.NEXT_PUBLIC_OTC_API_URL ||
      "http://localhost:3000";
    const secret = process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET;
    if (!secret)
      return new Response(
        JSON.stringify({ success: false, error: "Server HMAC secret missing" }),
        { status: 500 },
      );

    const path = "/order";
    const ts = Math.floor(Date.now() / 1000).toString();
    const payload = ["DELETE", path, ts, ""].join("\n");
    const sig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const res = await fetch(`${api}${path}?id=${orderId}`, {
      method: "DELETE",
      headers: { "x-timestamp": ts, "x-signature": sig },
    });
    if (!res.ok)
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cancel failed (${res.status})`,
        }),
        { status: 500 },
      );
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500 },
    );
  }
}
