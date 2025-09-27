import "server-only";

function sign(method: string, path: string, body: string, secret: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = [method.toUpperCase(), path, ts, body].join("\n");
  const crypto = require("crypto");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { sig, ts };
}

export async function POST() {
  const api = process.env.NEXT_PUBLIC_OTC_API_URL || "http://localhost:3000";
  const secret = process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET;
  if (!secret) {
    return new Response(
      JSON.stringify({ success: false, error: "Server not configured" }),
      { status: 500 },
    );
  }
  const path = "/order?all=true";
  const { sig, ts } = sign("DELETE", path, "", secret);
  const res = await fetch(`${api}${path}`, {
    method: "DELETE",
    headers: { "x-signature": sig, "x-timestamp": ts },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Cancel all failed (${res.status})`,
      }),
      { status: 500 },
    );
  }
  return new Response(JSON.stringify({ success: true, ...(json || {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
