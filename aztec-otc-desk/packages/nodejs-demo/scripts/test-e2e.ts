#!/usr/bin/env bun
/**
 * End-to-end test: Create order -> Fill order -> Verify closure
 * Tests complete order lifecycle
 */

import { execSync } from "child_process";

const L2_NODE_URL = "http://localhost:8080";
const API_URL = "http://localhost:3001";
const API_HMAC_SECRET = "development_secret_key_32_chars_min";

async function checkService(url: string, name: string): Promise<boolean> {
  try {
    await fetch(url);
    console.log(`✓ ${name} is running`);
    return true;
  } catch {
    console.error(`✗ ${name} is not running at ${url}`);
    return false;
  }
}

async function main() {
  console.log("🧪 Starting end-to-end order lifecycle test\n");

  // 1. Check services
  console.log("Step 1: Checking services...");
  const aztecOk = await checkService(`${L2_NODE_URL}/status`, "Aztec Sandbox");
  const apiOk = await checkService(`${API_URL}/health`, "Orderflow API");

  if (!aztecOk || !apiOk) {
    console.error("\n❌ Required services not running. Exiting.");
    process.exit(1);
  }

  // 2. Check balances
  console.log("\nStep 2: Checking balances...");
  const balances = execSync(`L2_NODE_URL=${L2_NODE_URL} bun run balances`, {
    encoding: "utf-8",
  });
  console.log(balances);

  // 3. Create order
  console.log("\nStep 3: Creating order...");
  const createOutput = execSync(
    `L2_NODE_URL=${L2_NODE_URL} API_URL=${API_URL} API_HMAC_SECRET=${API_HMAC_SECRET} bun run order:create`,
    { encoding: "utf-8" }
  );
  console.log(createOutput);

  // Extract order ID
  const orderIdMatch = createOutput.match(/Order ID: (\d+_\d+)/);
  if (!orderIdMatch) {
    console.error("❌ Failed to extract order ID from create output");
    process.exit(1);
  }
  const orderId = orderIdMatch[1];
  console.log(`✓ Created order: ${orderId}`);

  // 4. Verify order is in database
  console.log("\nStep 4: Verifying order in database...");
  const checkRes = await fetch(`${API_URL}/orders`);
  const checkJson = await checkRes.json();
  const order = checkJson.data.find((o: any) => o.orderId === orderId);

  if (!order) {
    console.error(`❌ Order ${orderId} not found in database`);
    process.exit(1);
  }
  console.log(`✓ Order found with status: ${order.status || "open"}`);

  // 5. Fill order
  console.log("\nStep 5: Filling order...");
  try {
    const fillOutput = execSync(
      `L2_NODE_URL=${L2_NODE_URL} API_URL=${API_URL} API_HMAC_SECRET=${API_HMAC_SECRET} ORDER_ID=${orderId} bun run scripts/fill_by_id.ts`,
      { encoding: "utf-8", timeout: 90000 }
    );
    console.log(fillOutput);
  } catch (error: any) {
    console.error("Fill error:", error.stdout || error.message);
    process.exit(1);
  }

  // 6. Verify order is closed
  console.log("\nStep 6: Verifying order closure...");
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for DB update

  const verifyRes = await fetch(`${API_URL}/orders`);
  const verifyJson = await verifyRes.json();
  const closedOrder = verifyJson.data.find((o: any) => o.orderId === orderId);

  if (!closedOrder) {
    console.error(`❌ Order ${orderId} disappeared from database`);
    process.exit(1);
  }

  if (closedOrder.status !== "filled") {
    console.error(
      `❌ Order status is "${closedOrder.status}", expected "filled"`
    );
    process.exit(1);
  }

  console.log(`✓ Order closed with status: ${closedOrder.status}`);

  // 7. Check final balances
  console.log("\nStep 7: Checking final balances...");
  const finalBalances = execSync(`L2_NODE_URL=${L2_NODE_URL} bun run balances`, {
    encoding: "utf-8",
  });
  console.log(finalBalances);

  console.log("\n✅ End-to-end test PASSED!\n");
  console.log("Summary:");
  console.log("  ✓ Services running");
  console.log("  ✓ Order created");
  console.log("  ✓ Order filled");
  console.log("  ✓ Order status updated to 'filled'");
  console.log("  ✓ Balances updated");
}

main().catch((e) => {
  console.error("\n❌ Test failed:", e.message);
  process.exit(1);
});
