import "server-only";
import { spawn } from "child_process";
import path from "path";

export async function POST(req: Request) {
  try {
    const body = await req.text();
    let orderParams = null;

    // Try to parse JSON body for wizard parameters
    try {
      if (body.trim()) {
        orderParams = JSON.parse(body);
      }
    } catch {
      // If parsing fails, use hardcoded script (backward compatibility)
    }

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

    // Add wizard parameters to environment if available
    if (orderParams) {
      console.log("Order wizard parameters:", orderParams);
      env.WIZARD_SELL_TOKEN = orderParams.sellTokenAddress || "";
      env.WIZARD_SELL_AMOUNT = orderParams.sellTokenAmount || "";
      env.WIZARD_BUY_TOKEN = orderParams.buyTokenAddress || "";
      env.WIZARD_BUY_AMOUNT = orderParams.buyTokenAmount || "";
      env.WIZARD_EXPIRY_HOURS = orderParams.expiryHours?.toString() || "24";
      env.WIZARD_MIN_FILL = orderParams.minFillAmount || "";
      env.WIZARD_SLIPPAGE_BPS = orderParams.slippageBps?.toString() || "50";
      env.USE_WIZARD_PARAMS = "true";
    }

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
      const raw = (stderr || stdout || "").toString();
      let reason: string | undefined;
      let userError = "Create failed";
      if (/Balance too low/i.test(raw)) {
        reason = "LOW_BALANCE";
        userError =
          "Insufficient private balance. Mint tokens to maker PXE and retry.";
      } else if (/OTC_HMAC_SECRET|API_HMAC_SECRET/i.test(raw)) {
        reason = "CONFIG";
        userError = "Server not configured: missing HMAC secret.";
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: raw.slice(0, 2000),
          reason,
          userError,
        }),
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
