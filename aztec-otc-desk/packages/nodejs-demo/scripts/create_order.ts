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

// Enhanced wizard parameters with safety features
type WizardParams = {
    sellTokenAddr: string;
    buyTokenAddr: string;
    sellAmountStr: string;
    buyAmountStr: string;
    expiryHours: number;
    minFillAmount: string;
    slippageBps: number;
    orderNonce: string;
    domainSeparator: string;
};

// Check if we should use wizard parameters
const useWizardParams = USE_WIZARD_PARAMS === "true";
let orderParams: WizardParams;

if (useWizardParams) {
    orderParams = {
        sellTokenAddr: process.env.WIZARD_SELL_TOKEN || ethDeployment.address,
        buyTokenAddr: process.env.WIZARD_BUY_TOKEN || usdcDeployment.address,
        sellAmountStr: process.env.WIZARD_SELL_AMOUNT || "1",
        buyAmountStr: process.env.WIZARD_BUY_AMOUNT || "5000",
        expiryHours: parseInt(process.env.WIZARD_EXPIRY_HOURS || "24"),
        minFillAmount: process.env.WIZARD_MIN_FILL || "",
        slippageBps: parseInt(process.env.WIZARD_SLIPPAGE_BPS || "50"),
        orderNonce: process.env.WIZARD_ORDER_NONCE || Date.now().toString(),
        domainSeparator: process.env.WIZARD_DOMAIN_SEPARATOR || "AZTEC_OTC_V1"
    };

    console.log("Creating order with enhanced parameters:");
    console.log("├─ Sell:", orderParams.sellAmountStr, "of token", orderParams.sellTokenAddr.slice(0, 10) + "...");
    console.log("├─ Buy:", orderParams.buyAmountStr, "of token", orderParams.buyTokenAddr.slice(0, 10) + "...");
    console.log("├─ Expiry:", orderParams.expiryHours, "hours");
    console.log("├─ Min Fill:", orderParams.minFillAmount || "None");
    console.log("├─ Max Slippage:", (orderParams.slippageBps / 100).toFixed(2) + "%");
    console.log("├─ Order Nonce:", orderParams.orderNonce.slice(0, 16) + "...");
    console.log("└─ Domain:", orderParams.domainSeparator);
} else {
    // Default parameters for backward compatibility
    orderParams = {
        sellTokenAddr: ethDeployment.address,
        buyTokenAddr: usdcDeployment.address,
        sellAmountStr: "1",
        buyAmountStr: "5000",
        expiryHours: 24,
        minFillAmount: "",
        slippageBps: 50,
        orderNonce: Date.now().toString(),
        domainSeparator: "AZTEC_OTC_V1"
    };

    console.log("Using default parameters - no wizard data provided");
}

const main = async () => {

    const pxe = await createPXE();

    // Get account index from environment (set by API)
    const walletAccountIndex = process.env.WALLET_ACCOUNT_INDEX ? parseInt(process.env.WALLET_ACCOUNT_INDEX) : 0;

    // Get test accounts
    const { getInitialTestAccountsManagers } = await import('@aztec/accounts/testing');
    const accountManagers = await getInitialTestAccountsManagers(pxe);
    const accountManager = accountManagers[walletAccountIndex];

    if (!accountManager) {
        throw new Error(`Account ${walletAccountIndex} not found`);
    }

    const seller = await accountManager.register();
    console.log(`Using wallet account ${walletAccountIndex}: ${seller.getAddress().toString()}`);

    // get tokens using orderParams
    const sellTokenAddress = AztecAddress.fromString(orderParams.sellTokenAddr);
    const buyTokenAddress = AztecAddress.fromString(orderParams.buyTokenAddr);
    const sellToken = await getTokenContract(pxe, seller, sellTokenAddress, L2_NODE_URL);
    const buyToken = await getTokenContract(pxe, seller, buyTokenAddress, L2_NODE_URL);

    // Convert amounts to proper values with validation
    // Parse decimal amounts properly by multiplying by 1e18 first, then converting to BigInt
    const sellAmount = BigInt(Math.floor(Number(orderParams.sellAmountStr) * 1e18));
    const buyAmount = BigInt(Math.floor(Number(orderParams.buyAmountStr) * 1e18));

    // Calculate expiry timestamp
    const expiryTimestamp = Date.now() + (orderParams.expiryHours * 60 * 60 * 1000);

    // Validate minimum fill amount if provided
    let minFillAmountBigInt: bigint | undefined;
    if (orderParams.minFillAmount && orderParams.minFillAmount !== "") {
        minFillAmountBigInt = BigInt(Math.floor(Number(orderParams.minFillAmount) * 1e18));
        if (minFillAmountBigInt > sellAmount) {
            throw new Error("Minimum fill amount cannot exceed sell amount");
        }
    }

    console.log("Order validation complete:");
    console.log("├─ Sell Amount (wei):", sellAmount.toString());
    console.log("├─ Buy Amount (wei):", buyAmount.toString());
    console.log("├─ Expires At:", new Date(expiryTimestamp).toISOString());
    if (minFillAmountBigInt) {
        console.log("├─ Min Fill (wei):", minFillAmountBigInt.toString());
    }
    console.log("└─ Exchange Rate:", (Number(buyAmount) / Number(sellAmount)).toFixed(6));

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

    // update api to add order with enhanced metadata
    console.log("Registering order with API...");
    const orderId = await createOrder(
        escrowContract.address,
        escrowContract.instance,
        secretKey,
        (await escrowContract.partialAddress),
        sellToken.address,
        sellAmount,
        buyToken.address,
        buyAmount,
        API_URL,
        walletAccountIndex
    );

    console.log("Order created successfully!");

    // Log enhanced order summary
    console.log("\n📋 Order Summary:");
    console.log("================");
    console.log(`🏷️  Order ID: ${orderId}`);
    console.log(`📍 Escrow Address: ${escrowContract.address}`);
    console.log(`💰 Selling: ${orderParams.sellAmountStr} tokens`);
    console.log(`🎯 Receiving: ${orderParams.buyAmountStr} tokens`);
    console.log(`⏰ Expires: ${new Date(expiryTimestamp).toLocaleString()}`);
    console.log(`⚡ Max Slippage: ${(orderParams.slippageBps / 100).toFixed(2)}%`);
    if (orderParams.minFillAmount) {
        console.log(`📊 Min Fill: ${orderParams.minFillAmount} tokens`);
    }
    console.log(`🔐 Order Nonce: ${orderParams.orderNonce}`);
    console.log(`🌐 Domain: ${orderParams.domainSeparator}`);
}

main();
