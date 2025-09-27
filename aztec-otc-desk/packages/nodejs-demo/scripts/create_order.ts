import "dotenv/config";
import {
    createPXE,
    deployEscrowContract,
    depositToEscrow,
    getTokenContract,
    wad,
} from "@aztec-otc-desk/contracts";
import { AztecAddress } from "@aztec/aztec.js";
import {
    eth as ethDeployment,
    usdc as usdcDeployment
} from "./data/deployments.json"
import {
    createOrder,
    ethMintAmount,
    getOTCAccounts,
    usdcMintAmount,
    getTestnetSendWaitOptions
} from "./utils";

// get environment variables
const { L2_NODE_URL, API_URL, USE_WIZARD_PARAMS } = process.env;
if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}
if (!API_URL) {
    throw new Error("API_URL is not defined");
}

// Check if we should use wizard parameters
const useWizardParams = USE_WIZARD_PARAMS === "true";
let sellTokenAddr = ethDeployment.address;
let buyTokenAddr = usdcDeployment.address;
let sellAmountStr = "1";
let buyAmountStr = "5000";

if (useWizardParams) {
    sellTokenAddr = process.env.WIZARD_SELL_TOKEN || ethDeployment.address;
    buyTokenAddr = process.env.WIZARD_BUY_TOKEN || usdcDeployment.address;
    sellAmountStr = process.env.WIZARD_SELL_AMOUNT || "1";
    buyAmountStr = process.env.WIZARD_BUY_AMOUNT || "5000";

    console.log("Using wizard parameters:");
    console.log("Sell:", sellAmountStr, "of token", sellTokenAddr);
    console.log("Buy:", buyAmountStr, "of token", buyTokenAddr);
}

const main = async () => {

    const pxe = await createPXE();

    // get accounts
    const { seller } = await getOTCAccounts(pxe);

    // get tokens
    const sellTokenAddress = AztecAddress.fromString(sellTokenAddr);
    const buyTokenAddress = AztecAddress.fromString(buyTokenAddr);
    const sellToken = await getTokenContract(pxe, seller, sellTokenAddress, L2_NODE_URL);
    const buyToken = await getTokenContract(pxe, seller, buyTokenAddress, L2_NODE_URL);

    // Convert amounts to proper values
    const sellAmount = wad(BigInt(Math.floor(Number(sellAmountStr))));
    const buyAmount = wad(BigInt(Math.floor(Number(buyAmountStr))));

    // if testnet, get send/ wait opts optimized for waiting and high gas
    const opts = await getTestnetSendWaitOptions(pxe);

    // build deploy
    const { contract: escrowContract, secretKey } = await deployEscrowContract(pxe,
        seller,
        sellToken.address,
        sellAmount,
        buyToken.address,
        buyAmount,
        opts
    );

    console.log("Escrow contract deployed, address: ", escrowContract.address);
    console.log("Escrow contract secret key: ", secretKey);

    console.log("Depositing tokens to escrow");
    const receipt = await depositToEscrow(
        escrowContract,
        seller,
        sellToken,
        sellAmount,
        opts
    );
    console.log("Tokens deposited to escrow, transaction hash: ", receipt.hash);

    // update api to add order
    await createOrder(
        escrowContract.address,
        escrowContract.instance,
        secretKey,
        (await escrowContract.partialAddress),
        sellToken.address,
        sellAmount,
        buyToken.address,
        buyAmount,
        API_URL
    )
}

main();
