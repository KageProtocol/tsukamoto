import "dotenv/config";
import { ethMintAmount, getOTCAccounts, usdcMintAmount, getTestnetSendWaitOptions } from "./utils";
import { eth as ethDeployment, usdc as usdcDeployment } from "./data/deployments.json"
import { AztecAddress } from "@aztec/aztec.js";
import { createPXE, getTokenContract } from "@aztec-otc-desk/contracts";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

// Helper function to format token amounts with commas
function formatWithCommas(amount: bigint, decimals: number): string {
    const divisor = 10n ** BigInt(decimals);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');

    // Add commas to whole number
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return `${wholeStr}.${fractionStr.slice(0, 6)}`;
}

/**
 * Reset strategy:
 * 1. Check current balances
 * 2. Mint fresh tokens to both accounts
 * 3. Verify new balances
 */
const main = async () => {
    console.log("\n🔄 RESET AND MINT SCRIPT");
    console.log("========================\n");

    const pxe = await createPXE();

    // Get accounts
    const { seller, buyer } = await getOTCAccounts(pxe);

    // Get token contracts
    const ethAddress = AztecAddress.fromString(ethDeployment.address);
    const eth = await getTokenContract(pxe, seller, ethAddress, L2_NODE_URL);

    const usdcAddress = AztecAddress.fromString(usdcDeployment.address);
    const usdc = await getTokenContract(pxe, seller, usdcAddress, L2_NODE_URL);

    // Get testnet options for faster transactions
    const opts = await getTestnetSendWaitOptions(pxe);

    console.log("📊 CURRENT BALANCES:");
    console.log("====================\n");

    // Check seller balances
    console.log("👤 SELLER (Account 0):");
    const sellerEthBefore = await eth.methods.balance_of_private(seller.getAddress()).simulate();
    const sellerUsdcBefore = await usdc.methods.balance_of_private(seller.getAddress()).simulate();
    console.log(`   ETH:  ${formatWithCommas(sellerEthBefore, 18)} ETH`);
    console.log(`   USDC: ${formatWithCommas(sellerUsdcBefore, 6)} USDC`);

    // Check buyer balances
    console.log("\n👤 BUYER (Account 1):");
    const buyerEthBefore = await eth.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();
    const buyerUsdcBefore = await usdc.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();
    console.log(`   ETH:  ${formatWithCommas(buyerEthBefore, 18)} ETH`);
    console.log(`   USDC: ${formatWithCommas(buyerUsdcBefore, 6)} USDC`);

    console.log("\n\n💰 MINTING FRESH TOKENS:");
    console.log("=========================\n");
    console.log(`Will mint ${ethMintAmount / 10n**18n} ETH to each account`);
    console.log(`Will mint ${usdcMintAmount / 10n**6n} USDC to each account\n`);

    // Mint ETH to seller
    console.log("⏳ Minting ETH to seller...");
    await eth
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), seller.getAddress(), ethMintAmount)
        .send(opts.send)
        .wait(opts.wait);
    console.log(`✅ ${ethMintAmount / 10n**18n} ETH minted to seller`);

    // Mint ETH to buyer
    console.log("⏳ Minting ETH to buyer...");
    await eth
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), buyer.getAddress(), ethMintAmount)
        .send(opts.send)
        .wait(opts.wait);
    console.log(`✅ ${ethMintAmount / 10n**18n} ETH minted to buyer`);

    // Mint USDC to seller
    console.log("⏳ Minting USDC to seller...");
    await usdc
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), seller.getAddress(), usdcMintAmount)
        .send(opts.send)
        .wait(opts.wait);
    console.log(`✅ ${usdcMintAmount / 10n**6n} USDC minted to seller`);

    // Mint USDC to buyer
    console.log("⏳ Minting USDC to buyer...");
    await usdc
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), buyer.getAddress(), usdcMintAmount)
        .send(opts.send)
        .wait(opts.wait);
    console.log(`✅ ${usdcMintAmount / 10n**6n} USDC minted to buyer`);

    console.log("\n\n📊 UPDATED BALANCES:");
    console.log("====================\n");

    // Check seller balances after
    console.log("👤 SELLER (Account 0):");
    const sellerEthAfter = await eth.methods.balance_of_private(seller.getAddress()).simulate();
    const sellerUsdcAfter = await usdc.methods.balance_of_private(seller.getAddress()).simulate();
    console.log(`   ETH:  ${formatWithCommas(sellerEthAfter, 18)} ETH`);
    console.log(`   USDC: ${formatWithCommas(sellerUsdcAfter, 6)} USDC`);

    // Check buyer balances after
    console.log("\n👤 BUYER (Account 1):");
    const buyerEthAfter = await eth.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();
    const buyerUsdcAfter = await usdc.withWallet(buyer).methods.balance_of_private(buyer.getAddress()).simulate();
    console.log(`   ETH:  ${formatWithCommas(buyerEthAfter, 18)} ETH`);
    console.log(`   USDC: ${formatWithCommas(buyerUsdcAfter, 6)} USDC`);

    console.log("\n✅ Minting complete!\n");
    console.log("💡 NOTE: Old balances from previous sandbox sessions are still there.");
    console.log("   To truly reset, you need to restart the Aztec sandbox with: aztec start --sandbox\n");
}

main();
