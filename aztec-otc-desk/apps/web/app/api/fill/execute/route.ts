import "server-only";
import { spawn } from "child_process";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return new Response("Missing orderId", { status: 400 });

    const cwd = process.cwd();
    const scriptPath = `${cwd}/packages/nodejs-demo/scripts/fill_by_id.ts`;
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

    const child = spawn("bun", ["run", scriptPath], {
      env,
      cwd,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    await new Promise((resolve) => child.on("close", resolve));
    const code = child.exitCode ?? 1;
    if (code !== 0) {
      return new Response(
        JSON.stringify({ success: false, error: stderr || "Unknown error" }),
        { status: 500 },
      );
    }
    return new Response(JSON.stringify({ success: true, output: stdout }), {
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500 },
    );
  }
}
