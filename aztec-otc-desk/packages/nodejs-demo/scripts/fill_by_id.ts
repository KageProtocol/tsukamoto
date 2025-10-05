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
} from "./utils";

async function main() {
  const { L2_NODE_URL, API_URL, ORDER_ID, WALLET_ACCOUNT_INDEX } = process.env as Record<
    string,
    string
  >;
  if (!L2_NODE_URL) throw new Error("L2_NODE_URL is not defined");
  if (!API_URL) throw new Error("API_URL is not defined");
  if (!ORDER_ID) throw new Error("ORDER_ID is not defined");

  const pxe = await createPXE(0);

  // Get account index from environment (set by API)
  const walletAccountIndex = WALLET_ACCOUNT_INDEX ? parseInt(WALLET_ACCOUNT_INDEX) : 1; // Default to buyer (account 1)

  // Get test accounts
  const { getInitialTestAccountsManagers } = await import('@aztec/accounts/testing');
  const accountManagers = await getInitialTestAccountsManagers(pxe);
  const accountManager = accountManagers[walletAccountIndex];

  if (!accountManager) {
    throw new Error(`Account ${walletAccountIndex} not found`);
  }

  const buyer = await accountManager.register();
  console.log(`Using wallet account ${walletAccountIndex} as buyer: ${buyer.getAddress().toString()}`);

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

  // Get token contracts based on the order's token addresses
  const sellTokenAddress = AztecAddress.fromString(orderToFill.sellTokenAddress);
  const buyTokenAddress = AztecAddress.fromString(orderToFill.buyTokenAddress);
  const sellToken = await getTokenContract(pxe, buyer, sellTokenAddress, L2_NODE_URL);
  const buyToken = await getTokenContract(pxe, buyer, buyTokenAddress, L2_NODE_URL);
  await sellToken.methods.sync_private_state().simulate();
  await buyToken.methods.sync_private_state().simulate();

  // Check buyer's balance for the buy token
  const buyerBalance = await buyToken.methods.balance_of_private(buyer.getAddress()).simulate();
  console.log("Buyer's balance for buy token:", buyerBalance.toString());

  const escrow = await escrowInstanceFromOrder(pxe, buyer, orderToFill);
  const opts = await getTestnetSendWaitOptions(pxe);

  console.log(`Filling order ${ORDER_ID} ...`);
  console.log("Order details:", {
    sellTokenAmount: orderToFill.sellTokenAmount,
    buyTokenAmount: orderToFill.buyTokenAmount,
    sellTokenAddress: orderToFill.sellTokenAddress,
    buyTokenAddress: orderToFill.buyTokenAddress
  });

  // Use the actual buy amount from the order instead of hardcoded value
  const buyAmountFromOrder = BigInt(orderToFill.buyTokenAmount);
  console.log("Using buy amount from order:", buyAmountFromOrder.toString());

  // Check if buyer has sufficient balance
  if (buyerBalance < buyAmountFromOrder) {
    throw new Error(`Insufficient balance. Required: ${buyAmountFromOrder.toString()}, Available: ${buyerBalance.toString()}`);
  }

  let txHash;
  try {
    txHash = await fillOTCOrder(escrow, buyer, buyToken, buyAmountFromOrder, opts);
    console.log(
      "Filled OTC order with txHash:",
      txHash.toString?.() ?? String(txHash),
    );
    console.log("Fill operation completed successfully");

    // Only close the order if fill succeeded
    await closeOrder(orderToFill.orderId, API_URL);
    console.log("Closed order", ORDER_ID);
    process.exit(0);
  } catch (fillError) {
    console.error("Fill operation failed:", fillError);
    throw new Error(`Fill failed: ${fillError.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
