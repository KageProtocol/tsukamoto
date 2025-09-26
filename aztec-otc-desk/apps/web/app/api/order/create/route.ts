import "server-only";
import { spawn } from "child_process";
import path from "path";

export async function POST() {
  try {
    const root = path.resolve(process.cwd(), "../..");
    const scriptPath = path.resolve(
      root,
      "packages/nodejs-demo/scripts/create_order.ts",
    );
    const env = {
      ...process.env,
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
      cwd: root,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const errored: { err?: Error } = {};
    child.on("error", (err) => {
      errored.err = err as Error;
    });

    await new Promise((resolve) => child.on("close", resolve));
    const code = child.exitCode ?? 1;
    if (errored.err) {
      return new Response(
        JSON.stringify({ success: false, error: errored.err.message }),
        { status: 500 },
      );
    }
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
