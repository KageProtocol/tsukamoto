import "dotenv/config";
import {
  createPXE,
  fillOTCOrder,
  getTokenContract,
} from "@aztec-otc-desk/contracts";
import { AztecAddress } from "@aztec/aztec.js";
import readline from "readline";
import {
  closeOrder,
  escrowInstanceFromOrder,
  getOrders,
  getOTCAccounts,
  getTestnetSendWaitOptions,
} from "./utils";

// get environment variables
const { L2_NODE_URL, API_URL } = process.env;
if (!L2_NODE_URL) {
  throw new Error("L2_NODE_URL is not defined");
}
if (!API_URL) {
  throw new Error("API_URL is not defined");
}

const main = async () => {
  // fetch orders
  let orders = await getOrders(API_URL);
  if (!orders || orders.length === 0) {
    throw new Error("No open orders found. Create an order first.");
  }

  // interactive selection
  console.log("Open orders:");
  orders.forEach((o, i) => {
    console.log(
      `${i}: escrow=${o.escrowAddress} sell=${o.sellTokenAmount} for buy=${o.buyTokenAmount}`,
    );
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = (q: string) =>
    new Promise<string>((res) => rl.question(q, res));
  const answer = await question("Select order index to fill: ");
  rl.close();
  const idx = Number(answer);
  if (!Number.isFinite(idx) || idx < 0 || idx >= orders.length) {
    throw new Error("Invalid order index.");
  }
  const orderToFill = orders[idx];
  console.log("Selected order:", orderToFill.orderId);

  // setup PXE (allow override via env BUYER_PXE_ID)
  const buyerPxeId = Number(process.env.BUYER_PXE_ID ?? 0);
  const pxe = await createPXE(Number.isFinite(buyerPxeId) ? buyerPxeId : 0);
  const { buyer } = await getOTCAccounts(pxe);

  // Get token contracts based on the order's token addresses
  const sellTokenAddress = AztecAddress.fromString(orderToFill.sellTokenAddress);
  const buyTokenAddress = AztecAddress.fromString(orderToFill.buyTokenAddress);
  const sellToken = await getTokenContract(pxe, buyer, sellTokenAddress, L2_NODE_URL).catch(
    () => {
      throw new Error(
        `Sell token ${orderToFill.sellTokenAddress} not found on node. Ensure setup:deploy ran in this session.`,
      );
    },
  );
  const buyToken = await getTokenContract(pxe, buyer, buyTokenAddress, L2_NODE_URL).catch(() => {
    throw new Error(
      `Buy token ${orderToFill.buyTokenAddress} not found on node. Ensure setup:deploy ran in this session and deployments.json matches.`,
    );
  });
  await sellToken.methods.sync_private_state().simulate();
  await buyToken.methods.sync_private_state().simulate();

  // Check buyer's balance for the buy token
  const buyerBalance = await buyToken.methods.balance_of_private(buyer.getAddress()).simulate();
  console.log("Buyer's balance for buy token:", buyerBalance.toString());

  // register escrow contract and account then get deployed instance
  const escrow = await escrowInstanceFromOrder(pxe, buyer, orderToFill);

  // if testnet, get send/ wait opts optimized for waiting and high gas
  const opts = await getTestnetSendWaitOptions(pxe);

  // Use the actual buy amount from the order instead of hardcoded value
  const buyAmountFromOrder = BigInt(orderToFill.buyTokenAmount);
  console.log("Order details:", {
    sellTokenAmount: orderToFill.sellTokenAmount,
    buyTokenAmount: orderToFill.buyTokenAmount,
    sellTokenAddress: orderToFill.sellTokenAddress,
    buyTokenAddress: orderToFill.buyTokenAddress
  });
  console.log("Using buy amount from order:", buyAmountFromOrder.toString());

  // Check if buyer has sufficient balance
  if (buyerBalance < buyAmountFromOrder) {
    throw new Error(`Insufficient balance. Required: ${buyAmountFromOrder.toString()}, Available: ${buyerBalance.toString()}`);
  }

  // fill the otc order
  console.log("Attempting to fill order");
  const txHash = await fillOTCOrder(
    escrow,
    buyer,
    buyToken,
    buyAmountFromOrder,
    opts,
  ).catch((e) => {
    const msg = (e as Error).message || String(e);
    if (msg.includes("connect") || msg.includes("ECONNREFUSED")) {
      throw new Error(
        "Buyer PXE not reachable. Start PXE on 8081 or switch createPXE(0) to use 8080.",
      );
    }
    throw e;
  });
  console.log("Filled OTC order with txHash: ", txHash);

  // remove the order from the OTC service so it isn't reused
  await closeOrder(orderToFill.orderId, API_URL);
};

main();
