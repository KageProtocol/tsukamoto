#!/bin/bash

# Sync token addresses from deployments.json to all relevant files
# This ensures CLI, UI, and scripts always use the same contract addresses

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔄 Syncing token addresses across project..."
echo ""

# Source file with deployed addresses
DEPLOYMENTS_FILE="$ROOT_DIR/packages/nodejs-demo/scripts/data/deployments.json"

if [ ! -f "$DEPLOYMENTS_FILE" ]; then
    echo "❌ Error: deployments.json not found at $DEPLOYMENTS_FILE"
    echo "   Run 'bun run setup:deploy' first"
    exit 1
fi

# Extract addresses using Node.js (more reliable than jq)
ETH_ADDR=$(node -e "console.log(require('$DEPLOYMENTS_FILE').eth.address)")
USDC_ADDR=$(node -e "console.log(require('$DEPLOYMENTS_FILE').usdc.address)")

echo "📋 Current Deployed Addresses:"
echo "   ETH:  $ETH_ADDR"
echo "   USDC: $USDC_ADDR"
echo ""

# Files to update
WEB_ENV="$ROOT_DIR/apps/web/.env"
ROOT_ENV="$ROOT_DIR/.env"

# Update web/.env
if [ -f "$WEB_ENV" ]; then
    echo "📝 Updating $WEB_ENV..."

    # Use sed to update or add the addresses
    if grep -q "NEXT_PUBLIC_ETH_ADDRESS" "$WEB_ENV"; then
        sed -i.bak "s|^NEXT_PUBLIC_ETH_ADDRESS=.*|NEXT_PUBLIC_ETH_ADDRESS=$ETH_ADDR|" "$WEB_ENV"
    else
        echo "NEXT_PUBLIC_ETH_ADDRESS=$ETH_ADDR" >> "$WEB_ENV"
    fi

    if grep -q "NEXT_PUBLIC_USDC_ADDRESS" "$WEB_ENV"; then
        sed -i.bak "s|^NEXT_PUBLIC_USDC_ADDRESS=.*|NEXT_PUBLIC_USDC_ADDRESS=$USDC_ADDR|" "$WEB_ENV"
    else
        echo "NEXT_PUBLIC_USDC_ADDRESS=$USDC_ADDR" >> "$WEB_ENV"
    fi

    rm -f "$WEB_ENV.bak"
    echo "   ✅ Updated web/.env"
else
    echo "   ⚠️  web/.env not found, skipping"
fi

# Update root .env
if [ -f "$ROOT_ENV" ]; then
    echo "📝 Updating $ROOT_ENV..."

    if grep -q "NEXT_PUBLIC_ETH_ADDRESS" "$ROOT_ENV"; then
        sed -i.bak "s|^NEXT_PUBLIC_ETH_ADDRESS=.*|NEXT_PUBLIC_ETH_ADDRESS=$ETH_ADDR|" "$ROOT_ENV"
    else
        echo "NEXT_PUBLIC_ETH_ADDRESS=$ETH_ADDR" >> "$ROOT_ENV"
    fi

    if grep -q "NEXT_PUBLIC_USDC_ADDRESS" "$ROOT_ENV"; then
        sed -i.bak "s|^NEXT_PUBLIC_USDC_ADDRESS=.*|NEXT_PUBLIC_USDC_ADDRESS=$USDC_ADDR|" "$ROOT_ENV"
    else
        echo "NEXT_PUBLIC_USDC_ADDRESS=$USDC_ADDR" >> "$ROOT_ENV"
    fi

    rm -f "$ROOT_ENV.bak"
    echo "   ✅ Updated root .env"
else
    echo "   ⚠️  root .env not found, skipping"
fi

echo ""
echo "✅ Token addresses synced successfully!"
echo ""
echo "💡 Next steps:"
echo "   1. Restart your web server: bun run dev (in apps/web)"
echo "   2. (Optional) Mint fresh tokens: bun run setup:mint"
echo ""
