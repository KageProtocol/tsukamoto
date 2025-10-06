import "server-only";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for fill operations
export const dynamic = 'force-dynamic';
import { spawn } from "child_process";
import path from "path";
import crypto from "crypto";

function sign(method: string, path: string, body: string, secret: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = [method.toUpperCase(), path, ts, body].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { ts, sig };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const accountIndex = url.searchParams.get("accountIndex") || "1"; // Default to buyer (account 1)
  if (!orderId) return new Response("Missing orderId", { status: 400 });

  // Validate that buyer is not the seller
  const api =
    process.env.OTC_API_URL ||
    process.env.NEXT_PUBLIC_OTC_API_URL ||
    "http://localhost:3001";
  const secret = process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET;

  if (secret) {
    try {
      // Fetch order details to check seller
      const orderPath = "/order";
      const qs = new URLSearchParams();
      qs.set("id", orderId);
      qs.set("include_sensitive", "true");

      const { ts, sig } = sign("GET", orderPath, "", secret);
      const res = await fetch(`${api}${orderPath}?${qs.toString()}`, {
        method: "GET",
        headers: { "x-timestamp": ts, "x-signature": sig },
      });

      if (res.ok) {
        const data = await res.json();
        const order = data.data?.[0];
        if (order) {
          const sellerAccountIndex = order.createdBy?.match(/account_(\d+)/i)?.[1];
          if (sellerAccountIndex !== undefined && parseInt(sellerAccountIndex) === parseInt(accountIndex)) {
            return new Response(
              JSON.stringify({
                error: "Cannot fill your own order. Please switch to a different account.",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
        }
      }
    } catch (error) {
      console.error("Validation error:", error);
      // Continue anyway - validation is not critical enough to block
    }
  }

  const root = path.resolve(process.cwd(), "../..");
  const scriptPath = path.resolve(
    root,
    "packages/nodejs-demo/scripts/fill_by_id.ts",
  );
  const env = {
    ...process.env,
    ORDER_ID: orderId,
    WALLET_ACCOUNT_INDEX: accountIndex,
    L2_NODE_URL: process.env.L2_NODE_URL || "http://localhost:8080",
    API_URL: api,
    API_HMAC_SECRET: secret || "development_secret_key_32_chars_min",
  };

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      function send(line: string) {
        controller.enqueue(enc.encode(`data: ${line}\n\n`));
      }

      const child = spawn("bun", ["run", scriptPath], {
        env,
        cwd: root,
        stdio: "pipe",
      });
      child.stdout.on("data", (d) => {
        const text = d.toString();
        text.split(/\r?\n/).forEach((line) => line && send(line));
      });
      child.stderr.on("data", (d) => {
        const text = d.toString();
        text.split(/\r?\n/).forEach((line) => line && send(`[err] ${line}`));
      });
      child.on("close", (code) => {
        send(`done: ${code}`);
        controller.close();
      });
      child.on("error", (err) => {
        send(`[spawn-error] ${err.message}`);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
