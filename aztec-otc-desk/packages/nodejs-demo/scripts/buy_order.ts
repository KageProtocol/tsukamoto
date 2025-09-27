import "dotenv/config";
import {
  createPXE,
  fillOTCOrder,
  getTokenContract,
} from "@aztec-otc-desk/contracts";
import {
  eth as ethDeployment,
  usdc as usdcDeployment,
} from "./data/deployments.json";
import { AztecAddress } from "@aztec/aztec.js";
import readline from "readline";
import {
  closeOrder,
  escrowInstanceFromOrder,
  getOrders,
  getOTCAccounts,
  getTestnetSendWaitOptions,
  usdcMintAmount,
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

  // instantiate token contracts
  const ethAddress = AztecAddress.fromString(ethDeployment.address);
  const eth = await getTokenContract(pxe, buyer, ethAddress, L2_NODE_URL).catch(
    () => {
      throw new Error(
        "ETH token not found on node. Ensure setup:deploy ran in this session.",
      );
    },
  );
  await eth.methods.sync_private_state().simulate();

  // get USDC token
  const usdcAddress = AztecAddress.fromString(usdcDeployment.address);
  const usdc = await getTokenContract(
    pxe,
    buyer,
    usdcAddress,
    L2_NODE_URL,
  ).catch(() => {
    throw new Error(
      "USDC token not found on node. Ensure setup:deploy ran in this session and deployments.json matches.",
    );
  });
  await usdc.methods.sync_private_state().simulate();

  // register escrow contract and account then get deployed instance
  const escrow = await escrowInstanceFromOrder(pxe, buyer, orderToFill);

  // if testnet, get send/ wait opts optimized for waiting and high gas
  const opts = await getTestnetSendWaitOptions(pxe);

  // fill the otc order
  console.log("Attempting to fill order");
  const txHash = await fillOTCOrder(
    escrow,
    buyer,
    usdc,
    usdcMintAmount,
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
