import "dotenv/config";
import {
    createPXE,
    deployTokenContractWithMinter,
    TOKEN_METADATA,
} from "@aztec-otc-desk/contracts"
import { writeFileSync } from "node:fs"
import { getTestnetSendWaitOptions, getOTCAccounts } from "./utils";

// Deploys Ether and USD Coin token contracts
const main = async () => {
    const pxe = await createPXE();

    // get accounts
    const { seller } = await getOTCAccounts(pxe);

    // if testnet, get send/ wait opts optimized for waiting and high gas
    const opts = await getTestnetSendWaitOptions(pxe);

    // deploy token contracts
    console.log("Deploying Wrapped Ether token contract");
    const eth = await deployTokenContractWithMinter(TOKEN_METADATA.eth, seller, opts);
    console.log("eth token contract deployed, address: ", eth.address);

    console.log("Deploying USD Coin token contract");
    const usdc = await deployTokenContractWithMinter(TOKEN_METADATA.usdc, seller, opts);
    console.log("USDC token contract deployed, address: ", usdc.address);

    // write deployment to fs
    const deployments = {
        eth: { address: eth.address },
        usdc: { address: usdc.address }
    };
    const filepath = `${__dirname}/data/deployments.json`;
    writeFileSync(filepath, JSON.stringify(deployments, null, 2));
    console.log(`Deployments written to ${filepath}`);

    // Auto-sync for development (can be disabled for testnet/production)
    const AUTO_SYNC = process.env.AUTO_SYNC_DEPLOYMENTS !== 'false';

    if (AUTO_SYNC) {
        console.log("\n🔄 Auto-syncing addresses to configuration files...");
        try {
            // Import and run sync script
            const { execSync } = await import("child_process");
            execSync("bun run sync:deployments", {
                stdio: "inherit",
                cwd: __dirname + "/.."
            });
            console.log("✅ Addresses synced! Restart your Next.js dev server to apply changes.\n");
        } catch (error) {
            console.error("⚠️  Auto-sync failed:", error);
            console.log("   Run 'bun run sync:deployments' manually\n");
        }
    } else {
        console.log("\n⚠️  Auto-sync disabled (AUTO_SYNC_DEPLOYMENTS=false)");
        console.log("   Run 'bun run sync:deployments' to update .env files");
        console.log("   Then restart your Next.js dev server!\n");
    }
}

main();
