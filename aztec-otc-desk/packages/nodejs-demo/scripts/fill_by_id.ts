import "dotenv/config";
import { AztecAddress } from "@aztec/aztec.js";
import crypto from "crypto";
import {
  createPXE,
  fillOTCOrder,
  getTokenContract,
} from "@aztec-otc-desk/contracts";
import {
  escrowInstanceFromOrder,
  getOrders,
  getOTCAccounts,
  getTestnetSendWaitOptions,
  closeOrder,
  usdcMintAmount,
} from "./utils";
import {
  eth as ethDeployment,
  usdc as usdcDeployment,
} from "./data/deployments.json";

async function main() {
  const { L2_NODE_URL, API_URL, ORDER_ID } = process.env as Record<
    string,
    string
  >;
  if (!L2_NODE_URL) throw new Error("L2_NODE_URL is not defined");
  if (!API_URL) throw new Error("API_URL is not defined");
  if (!ORDER_ID) throw new Error("ORDER_ID is not defined");

  const pxe = await createPXE(0);
  const { buyer } = await getOTCAccounts(pxe);

  // fetch order by id with include_sensitive=true (requires HMAC)
  const ts = Math.floor(Date.now() / 1000).toString();
  const path = "/order";
  const body = "";
  const payload = ["GET", path, ts, body].join("\n");
  const secret = process.env.API_HMAC_SECRET || "";
  if (!secret) throw new Error("API_HMAC_SECRET not set for fill_by_id");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const res = await fetch(
    `${API_URL}${path}?id=${ORDER_ID}&include_sensitive=true`,
    {
      method: "GET",
      headers: { "x-timestamp": ts, "x-signature": sig },
    },
  );
  if (!res.ok) throw new Error(`Failed to fetch order ${ORDER_ID}`);
  const json = (await res.json()) as { success: boolean; data: any[] };
  if (!json.success || !json.data || json.data.length === 0) {
    throw new Error(`Order ${ORDER_ID} not found`);
  }
  const orderToFill = json.data[0];

  const ethAddress = AztecAddress.fromString(ethDeployment.address);
  const usdcAddress = AztecAddress.fromString(usdcDeployment.address);
  const eth = await getTokenContract(pxe, buyer, ethAddress, L2_NODE_URL);
  const usdc = await getTokenContract(pxe, buyer, usdcAddress, L2_NODE_URL);
  await eth.methods.sync_private_state().simulate();
  await usdc.methods.sync_private_state().simulate();

  const escrow = await escrowInstanceFromOrder(pxe, buyer, orderToFill);
  const opts = await getTestnetSendWaitOptions(pxe);

  console.log(`Filling order ${ORDER_ID} ...`);
  const txHash = await fillOTCOrder(escrow, buyer, usdc, usdcMintAmount, opts);
  console.log(
    "Filled OTC order with txHash:",
    txHash.toString?.() ?? String(txHash),
  );

  await closeOrder(orderToFill.orderId, API_URL);
  console.log("Closed order", ORDER_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
