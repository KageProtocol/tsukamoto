import "dotenv/config";
import { ethMintAmount, getOTCAccounts, usdcMintAmount, getTestnetSendWaitOptions } from "./utils";
import { eth as ethDeployment, usdc as usdcDeployment } from "./data/deployments.json"
import { AztecAddress } from "@aztec/aztec.js";
import { createPXE, getTokenContract } from "@aztec-otc-desk/contracts";

const { L2_NODE_URL } = process.env;
if (!L2_NODE_URL) {
    throw new Error("L2_NODE_URL is not defined");
}

// Mints both ETH and USDC to both seller and buyer accounts
const main = async () => {
    const pxe = await createPXE();

    // get accounts
    const { seller, buyer } = await getOTCAccounts(pxe);

    // get eth token
    const ethAddress = AztecAddress.fromString(ethDeployment.address);
    const eth = await getTokenContract(pxe, seller, ethAddress, L2_NODE_URL);

    // if testnet, get send/ wait opts optimized for waiting and high gas
    const opts = await getTestnetSendWaitOptions(pxe);

    // mint ETH to seller
    console.log("Minting ETH to seller account...");
    await eth
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), seller.getAddress(), ethMintAmount * 10n)
        .send(opts.send)
        .wait(opts.wait);
    console.log("✅ 10 ETH minted to seller");

    // mint ETH to buyer
    console.log("Minting ETH to buyer account...");
    await eth
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), buyer.getAddress(), ethMintAmount * 10n)
        .send(opts.send)
        .wait(opts.wait);
    console.log("✅ 10 ETH minted to buyer");

    // get USDC token
    const usdcAddress = AztecAddress.fromString(usdcDeployment.address);
    const usdc = await getTokenContract(pxe, seller, usdcAddress, L2_NODE_URL);

    // mint USDC to seller
    console.log("Minting USDC to seller account...");
    await usdc
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), seller.getAddress(), usdcMintAmount * 10n)
        .send(opts.send)
        .wait(opts.wait);
    console.log("✅ 50,000 USDC minted to seller");

    // mint USDC to buyer
    console.log("Minting USDC to buyer account...");
    await usdc
        .withWallet(seller)
        .methods
        .mint_to_private(seller.getAddress(), buyer.getAddress(), usdcMintAmount * 10n)
        .send(opts.send)
        .wait(opts.wait);
    console.log("✅ 50,000 USDC minted to buyer");
}

main();
