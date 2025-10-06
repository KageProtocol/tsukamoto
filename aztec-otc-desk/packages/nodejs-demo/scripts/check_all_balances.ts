import "dotenv/config";
import { getOTCAccounts } from "./utils";
import { eth as ethDeployment, usdc as usdcDeployment } from "./data/deployments.json";
import { AztecAddress } from "@aztec/aztec.js";
import { createPXE, getTokenContract } from "@aztec-otc-desk/contracts";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

// Helper function to format token amounts
function formatAmount(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    return `${whole}.${fractionStr.slice(0, 6)}`;
}

const main = async () => {
    console.log("\n🔍 Checking all account balances...\n");

    const pxe = await createPXE();

    // Get both accounts
    const { seller, buyer } = await getOTCAccounts(pxe);

    // Get token contracts
    const ethAddress = AztecAddress.fromString(ethDeployment.address);
    const usdcAddress = AztecAddress.fromString(usdcDeployment.address);

    const eth = await getTokenContract(pxe, seller, ethAddress, L2_NODE_URL);
    const usdc = await getTokenContract(pxe, seller, usdcAddress, L2_NODE_URL);

    console.log("📊 Account Balances:");
    console.log("===================\n");

    // Check seller (account 0) balances
    console.log("👤 SELLER (Account 0):");
    console.log(`   Address: ${seller.getAddress()}`);

    const sellerEthBalance = await eth.methods.balance_of_private(seller.getAddress()).simulate();
    const sellerUsdcBalance = await usdc.methods.balance_of_private(seller.getAddress()).simulate();

    console.log(`   💎 ETH:  ${formatAmount(sellerEthBalance, 18)} ETH`);
    console.log(`   💵 USDC: ${formatAmount(sellerUsdcBalance, 6)} USDC`);

    // Check buyer (account 1) balances
    console.log("\n👤 BUYER (Account 1):");
    console.log(`   Address: ${buyer.getAddress()}`);

    const buyerEthBalance = await eth.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();
    const buyerUsdcBalance = await usdc.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();

    console.log(`   💎 ETH:  ${formatAmount(buyerEthBalance, 18)} ETH`);
    console.log(`   💵 USDC: ${formatAmount(buyerUsdcBalance, 6)} USDC`);

    console.log("\n📝 Contract Information:");
    console.log("========================");
    console.log(`ETH Token:  ${ethDeployment.address}`);
    console.log(`USDC Token: ${usdcDeployment.address}`);

    console.log("\n✅ Balance check complete!\n");
}

main().catch(console.error);
