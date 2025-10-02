#!/usr/bin/env bun
/**
 * Sync deployment addresses to all required locations
 * Run after deploy.ts to ensure all services use correct addresses
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEPLOYMENTS_PATH = resolve(__dirname, "./data/deployments.json");
const WEB_ENV_PATH = resolve(__dirname, "../../../apps/web/.env");

interface Deployments {
  eth: { address: string };
  usdc: { address: string };
}

function loadDeployments(): Deployments {
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(
      `Deployments file not found at ${DEPLOYMENTS_PATH}. Run 'bun run setup:deploy' first.`
    );
  }

  const data = readFileSync(DEPLOYMENTS_PATH, "utf-8");
  return JSON.parse(data);
}

function updateEnvFile(path: string, deployments: Deployments): void {
  if (!existsSync(path)) {
    console.warn(`⚠️  .env file not found at ${path}, skipping...`);
    return;
  }

  let content = readFileSync(path, "utf-8");
  const lines = content.split("\n");
  let updated = false;

  // Update ETH address
  const ethIndex = lines.findIndex((line) =>
    line.startsWith("NEXT_PUBLIC_ETH_ADDRESS=")
  );
  if (ethIndex >= 0) {
    const oldValue = lines[ethIndex];
    lines[ethIndex] = `NEXT_PUBLIC_ETH_ADDRESS=${deployments.eth.address}`;
    if (oldValue !== lines[ethIndex]) {
      console.log(`  Updated ETH address in ${path}`);
      updated = true;
    }
  } else {
    console.warn(`  ⚠️  NEXT_PUBLIC_ETH_ADDRESS not found in ${path}`);
  }

  // Update USDC address
  const usdcIndex = lines.findIndex((line) =>
    line.startsWith("NEXT_PUBLIC_USDC_ADDRESS=")
  );
  if (usdcIndex >= 0) {
    const oldValue = lines[usdcIndex];
    lines[usdcIndex] = `NEXT_PUBLIC_USDC_ADDRESS=${deployments.usdc.address}`;
    if (oldValue !== lines[usdcIndex]) {
      console.log(`  Updated USDC address in ${path}`);
      updated = true;
    }
  } else {
    console.warn(`  ⚠️  NEXT_PUBLIC_USDC_ADDRESS not found in ${path}`);
  }

  if (updated) {
    writeFileSync(path, lines.join("\n"));
    console.log(`✅ Updated ${path}`);
  } else {
    console.log(`✓ ${path} already up to date`);
  }
}

async function main() {
  console.log("🔄 Syncing deployment addresses...\n");

  try {
    // Load deployments
    const deployments = loadDeployments();
    console.log("📋 Current deployments:");
    console.log(`  ETH:  ${deployments.eth.address}`);
    console.log(`  USDC: ${deployments.usdc.address}\n`);

    // Update web .env
    console.log("📝 Updating configuration files...");
    updateEnvFile(WEB_ENV_PATH, deployments);

    console.log("\n✨ Deployment sync complete!");
    console.log(
      "\n⚠️  IMPORTANT: Restart the Next.js dev server to apply changes:"
    );
    console.log("   cd apps/web && bun run dev\n");
  } catch (error) {
    console.error("❌ Error syncing deployments:", error);
    process.exit(1);
  }
}

main();
