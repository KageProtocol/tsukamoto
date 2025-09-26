import "server-only";
import crypto from "crypto";

function sign(method: string, path: string, body: string, secret: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = [method.toUpperCase(), path, ts, body].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { ts, sig };
}

export async function POST(req: Request) {
  try {
    const { orderId, escrowAddress, sellTokenAddress, buyTokenAddress } =
      await req.json();

    const api =
      process.env.OTC_API_URL ||
      process.env.NEXT_PUBLIC_OTC_API_URL ||
      "http://localhost:3000";
    const secret = process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET;
    if (!secret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server not configured (OTC_HMAC_SECRET missing).",
        }),
        { status: 500 },
      );
    }

    // fetch include_sensitive order details for the selected order
    const path = "/order";
    const qs = new URLSearchParams();
    if (orderId) qs.set("id", orderId);
    if (escrowAddress) qs.set("escrow_address", escrowAddress);
    if (sellTokenAddress) qs.set("sell_token_address", sellTokenAddress);
    if (buyTokenAddress) qs.set("buy_token_address", buyTokenAddress);
    qs.set("include_sensitive", "true");

    const { ts, sig } = sign("GET", path, "", secret);
    const res = await fetch(`${api}${path}?${qs.toString()}`, {
      method: "GET",
      headers: { "x-timestamp": ts, "x-signature": sig },
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: data?.error || "Failed to fetch order",
        }),
        { status: 500 },
      );
    }

    return new Response(JSON.stringify({ success: true, data: data.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500 },
    );
  }
}
