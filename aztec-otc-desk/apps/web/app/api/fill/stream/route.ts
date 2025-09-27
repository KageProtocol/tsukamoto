import "server-only";
export const runtime = "nodejs";
import { spawn } from "child_process";
import path from "path";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return new Response("Missing orderId", { status: 400 });

  const root = path.resolve(process.cwd(), "../..");
  const scriptPath = path.resolve(
    root,
    "packages/nodejs-demo/scripts/fill_by_id.ts",
  );
  const env = {
    ...process.env,
    ORDER_ID: orderId,
    L2_NODE_URL: process.env.L2_NODE_URL || "http://localhost:8080",
    API_URL:
      process.env.OTC_API_URL ||
      process.env.NEXT_PUBLIC_OTC_API_URL ||
      "http://localhost:3000",
    API_HMAC_SECRET:
      process.env.OTC_HMAC_SECRET || process.env.API_HMAC_SECRET || "",
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
