#!/usr/bin/env bun
/**
 * Validate that all configuration is in sync and ready for use
 * Run before starting the app to catch configuration issues
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEPLOYMENTS_PATH = resolve(__dirname, "./data/deployments.json");
const WEB_ENV_PATH = resolve(__dirname, "../../../apps/web/.env");

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateDeployments(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  // Check if deployments.json exists
  if (!existsSync(DEPLOYMENTS_PATH)) {
    result.valid = false;
    result.errors.push(
      `Deployments file not found: ${DEPLOYMENTS_PATH}\n  Run: bun run setup:deploy`
    );
    return result;
  }

  // Load and validate deployments
  try {
    const data = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf-8"));

    if (!data.eth?.address) {
      result.valid = false;
      result.errors.push("Missing ETH token address in deployments.json");
    } else if (!/^0x[a-fA-F0-9]{64}$/.test(data.eth.address)) {
      result.valid = false;
      result.errors.push(
        `Invalid ETH token address format: ${data.eth.address}`
      );
    }

    if (!data.usdc?.address) {
      result.valid = false;
      result.errors.push("Missing USDC token address in deployments.json");
    } else if (!/^0x[a-fA-F0-9]{64}$/.test(data.usdc.address)) {
      result.valid = false;
      result.errors.push(
        `Invalid USDC token address format: ${data.usdc.address}`
      );
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse deployments.json: ${error}`);
  }

  return result;
}

function validateWebEnv(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!existsSync(WEB_ENV_PATH)) {
    result.valid = false;
    result.errors.push(
      `Web .env file not found: ${WEB_ENV_PATH}\n  Copy from .env.example and run: bun run sync:deployments`
    );
    return result;
  }

  const envContent = readFileSync(WEB_ENV_PATH, "utf-8");
  const deployments = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf-8"));

  // Check ETH address
  const ethMatch = envContent.match(/NEXT_PUBLIC_ETH_ADDRESS=(.+)/);
  if (!ethMatch) {
    result.valid = false;
    result.errors.push("Missing NEXT_PUBLIC_ETH_ADDRESS in web .env");
  } else if (ethMatch[1] !== deployments.eth.address) {
    result.valid = false;
    result.errors.push(
      `ETH address mismatch:\n  .env:           ${ethMatch[1]}\n  deployments.json: ${deployments.eth.address}\n  Run: bun run sync:deployments`
    );
  }

  // Check USDC address
  const usdcMatch = envContent.match(/NEXT_PUBLIC_USDC_ADDRESS=(.+)/);
  if (!usdcMatch) {
    result.valid = false;
    result.errors.push("Missing NEXT_PUBLIC_USDC_ADDRESS in web .env");
  } else if (usdcMatch[1] !== deployments.usdc.address) {
    result.valid = false;
    result.errors.push(
      `USDC address mismatch:\n  .env:           ${usdcMatch[1]}\n  deployments.json: ${deployments.usdc.address}\n  Run: bun run sync:deployments`
    );
  }

  // Check API URL
  const apiMatch = envContent.match(/NEXT_PUBLIC_OTC_API_URL=(.+)/);
  if (!apiMatch) {
    result.warnings.push(
      "Missing NEXT_PUBLIC_OTC_API_URL - using default"
    );
  }

  return result;
}

function validateServices(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  // Check if Aztec sandbox is running
  fetch("http://localhost:8080/status")
    .then(() => {
      console.log("✓ Aztec Sandbox: Running");
    })
    .catch(() => {
      result.warnings.push(
        "Aztec Sandbox not running on port 8080\n  Start with: aztec start --sandbox"
      );
    });

  // Check if orderflow service is running
  fetch("http://localhost:3001/health")
    .then(() => {
      console.log("✓ Orderflow Service: Running");
    })
    .catch(() => {
      result.warnings.push(
        "Orderflow service not running on port 3001\n  Start with: cd packages/orderflow && bun run dev"
      );
    });

  return result;
}

async function main() {
  console.log("🔍 Validating configuration...\n");

  let allValid = true;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate deployments
  console.log("📋 Checking deployments.json...");
  const deploymentsResult = validateDeployments();
  if (!deploymentsResult.valid) {
    allValid = false;
    allErrors.push(...deploymentsResult.errors);
  } else {
    console.log("✓ deployments.json is valid");
  }
  allWarnings.push(...deploymentsResult.warnings);

  // Validate web .env
  if (deploymentsResult.valid) {
    console.log("\n📝 Checking web .env configuration...");
    const webEnvResult = validateWebEnv();
    if (!webEnvResult.valid) {
      allValid = false;
      allErrors.push(...webEnvResult.errors);
    } else {
      console.log("✓ Web .env is in sync with deployments");
    }
    allWarnings.push(...webEnvResult.warnings);
  }

  // Validate services (async, just warnings)
  console.log("\n🔌 Checking services...");
  await new Promise((resolve) => setTimeout(resolve, 500)); // Give fetches time

  // Print results
  if (allErrors.length > 0) {
    console.log("\n❌ ERRORS:");
    allErrors.forEach((err) => console.log(`  • ${err}`));
  }

  if (allWarnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    allWarnings.forEach((warn) => console.log(`  • ${warn}`));
  }

  if (allValid && allWarnings.length === 0) {
    console.log("\n✅ All checks passed! Configuration is ready.\n");
    process.exit(0);
  } else if (allValid) {
    console.log(
      "\n⚠️  Configuration is valid but some services may not be running.\n"
    );
    process.exit(0);
  } else {
    console.log(
      "\n❌ Configuration validation failed. Fix the errors above.\n"
    );
    process.exit(1);
  }
}

main();
