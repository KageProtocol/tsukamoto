import "dotenv/config";
import { AztecAddress } from "@aztec/aztec.js";
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

  const orders = await getOrders(API_URL);
  const orderToFill = orders.find((o) => o.orderId === ORDER_ID);
  if (!orderToFill) throw new Error(`Order ${ORDER_ID} not found`);

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
