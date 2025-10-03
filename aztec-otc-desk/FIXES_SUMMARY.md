# Comprehensive Fixes - Order Lifecycle Issues

## Issues Fixed

### 1. **Contradictory Success Detection** ✅
**Problem:** UI showed "Fill failed (exit code: 0)" - exit code 0 means success but UI showed failure

**Root Cause:** Logic required `hasSuccess` flag to be true, but if script exited successfully without specific message, it showed as failed

**Fix:** `apps/web/app/page.tsx:342`
```typescript
// OLD: Required specific success message
const isSuccess = hasSuccess && !hasError && exitCode === 0;

// NEW: Exit 0 = success (with or without specific message)
const isSuccess = exitCode === 0 && (hasSuccess || !hasError);
```

### 2. **Filled Orders Shown in Available Orders** ✅
**Problem:** Orders with status "filled" still appeared in "Available Orders" tab

**Root Cause:** No status filtering on received orders tab

**Fix:** `apps/web/app/page.tsx:161-166`
```typescript
// Only show open/pending orders in available section
const receivedOrders = orders.filter(o => {
  const status = o.status?.toLowerCase();
  return !status || status === 'open' || status === 'pending';
});
```

### 3. **Fill Script Hanging** ✅
**Problem:** Fill script didn't terminate, causing timeouts

**Root Cause:** Missing `process.exit(0)` after successful completion

**Fix:** `packages/nodejs-demo/scripts/fill_by_id.ts:95`
```typescript
await closeOrder(orderToFill.orderId, API_URL);
console.log("Closed order", ORDER_ID);
process.exit(0); // ← Added this
```

### 4. **Wrong API Port in Fill Stream** ✅
**Problem:** Fill operations failed to reach API

**Root Cause:** Hardcoded port 3000 instead of 3001

**Fix:** `apps/web/app/api/fill/stream/route.ts:23`
```typescript
API_URL: process.env.OTC_API_URL ||
         process.env.NEXT_PUBLIC_OTC_API_URL ||
         "http://localhost:3001", // was 3000
```

### 5. **API Route Timeout** ✅
**Problem:** Fill operations timeout after 10 seconds

**Root Cause:** Missing `maxDuration` configuration

**Fix:** `apps/web/app/api/fill/stream/route.ts:3-4`
```typescript
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';
```

### 6. **Balances Not Refreshing** ✅
**Problem:** Portfolio doesn't reflect current balances after fill

**Root Cause:** No balance refresh trigger after successful fill

**Fix:** `apps/web/app/page.tsx:346-364`
```typescript
if (isSuccess) {
  await fetchOrders();
  setBalanceRefreshing(true); // ← Added

  // Refresh balances after 2s
  setTimeout(() => setBalanceRefreshing(false), 2000);
}
```

### 7. **Better Success Messages** ✅
**Problem:** Success detection relied on specific log messages

**Fix:** `apps/web/app/page.tsx:325-329`
```typescript
// Success indicators - match actual script output
if (message.includes("Order closed in OTC order service") ||
    message.includes("Closed order")) {
  hasSuccess = true;
}
```

### 8. **Portfolio Using Mock Data** ✅
**Problem:** Portfolio showed hardcoded balances, didn't reflect actual on-chain state

**Root Cause:** `PortfolioModal.tsx` used mock data instead of fetching from blockchain

**Fix:**
- Created `/api/balances` endpoint that calls `print_balances.ts`
- Parses real blockchain balances from Aztec accounts
- Auto-refreshes after order creation and fills
- Account switcher for buyer/seller (temporary until wallet integration)

**Files:**
- `apps/web/app/api/balances/route.ts` (new) - Live balance fetching
- `apps/web/app/components/PortfolioModal.tsx` - Removed mock data, added API integration
- `apps/web/app/page.tsx:617-619` - Trigger balance refresh after order creation

## Files Modified

1. **apps/web/app/page.tsx**
   - Fixed order filtering (lines 161-166)
   - Fixed success detection logic (line 342)
   - Added balance refresh (lines 346, 364)
   - Improved error messages (lines 366-370)

2. **apps/web/app/api/fill/stream/route.ts**
   - Fixed API port 3000 → 3001 (line 23)
   - Added HMAC secret default (line 25)
   - Added maxDuration timeout (line 3)

3. **packages/nodejs-demo/scripts/fill_by_id.ts**
   - Added process.exit(0) (line 95)

4. **packages/nodejs-demo/package.json**
   - Added L2_NODE_URL to balances script (line 21)
   - Added test:e2e script (line 29)

5. **apps/web/app/api/balances/route.ts** (NEW)
   - Live balance fetching endpoint
   - Parses output from print_balances.ts
   - Supports buyer/seller account switching
   - Converts Wei to human-readable format

6. **apps/web/app/components/PortfolioModal.tsx**
   - Removed hardcoded mock data (lines 31-44 deleted)
   - Added live API integration (line 42)
   - Added account switcher UI (lines 143-167)
   - Auto-refresh on open and account change (line 78)

## New Features

### End-to-End Test Suite ✅
**File:** `packages/nodejs-demo/scripts/test-e2e.ts`

**Purpose:** Comprehensive order lifecycle testing

**Tests:**
1. ✓ Services running (Aztec + API)
2. ✓ Order creation
3. ✓ Order appears in database
4. ✓ Order fill execution
5. ✓ Order status updates to "filled"
6. ✓ Balances reflect changes

**Usage:**
```bash
cd packages/nodejs-demo
bun run test:e2e
```

## Order Lifecycle Flow (Fixed)

```
1. Create Order
   ├─ Deploy escrow contract
   ├─ Store in database (status: open)
   └─ Return order ID

2. Order appears in UI
   ├─ "Your Orders" tab (all orders you created)
   └─ "Available Orders" tab (only open/pending orders)

3. Fill Order
   ├─ Check buyer balance
   ├─ Execute fill transaction
   ├─ Close order in database (status: filled)
   └─ Exit with code 0

4. UI Updates
   ├─ Detect exit code 0 = success
   ├─ Show success toast
   ├─ Add to transaction history
   ├─ Refresh order list
   └─ Refresh balances

5. Order Removed from Available
   ├─ Status = "filled"
   └─ Filtered out of "Available Orders"
```

## Testing Checklist

Before considering the system functional:

- [ ] Run `bun run validate` - all checks pass
- [ ] Create order from UI - succeeds
- [ ] Order appears in "Your Orders" tab
- [ ] Order appears in "Available Orders" tab
- [ ] Fill order from UI - succeeds with proper message
- [ ] Order removed from "Available Orders"
- [ ] Order status = "filled" in "Your Orders"
- [ ] Transaction appears in history
- [ ] Balances updated (check portfolio)
- [ ] No contradictory messages (e.g., "failed (exit code: 0)")
- [ ] Run `bun run test:e2e` - passes

## API Port Reference

**Critical:** All services must use correct ports:

| Service | Port | Environment Variable |
|---------|------|---------------------|
| Aztec Sandbox | 8080 | L2_NODE_URL |
| Orderflow API | 3001 | API_URL, NEXT_PUBLIC_OTC_API_URL |
| Next.js Dev | 3000 | - |
| PostgreSQL | 5434 | DATABASE_URL |
| Redis | 6379 | REDIS_URL |

## Next Steps

1. **Restart Next.js** to apply all changes:
   ```bash
   cd apps/web
   # Ctrl+C to stop
   bun run dev
   ```

2. **Test complete flow:**
   ```bash
   cd packages/nodejs-demo
   bun run test:e2e
   ```

3. **Monitor logs** during testing:
   - Aztec logs: Look for transaction confirmations
   - Orderflow logs: Check for status updates
   - Browser console: Check for errors

## Portfolio Balance Features

### Current Implementation ✅
1. **Live Balance Fetching:** Real-time balances from Aztec blockchain
2. **Account Switching:** Toggle between buyer/seller accounts
3. **Auto-Refresh:** Balances update after order creation and fills
4. **USD Value Calculation:** Real-time portfolio value in USD
5. **Wei Conversion:** Automatic conversion to human-readable format

### Wallet-Ready Architecture
The portfolio is designed to be wallet-agnostic:

```typescript
// Current: Hardcoded accounts (buyer/seller)
const account = "buyer" | "seller";

// Future: Dynamic wallet connection
const account = connectedWallet.address;
```

**When implementing wallet connection:**
1. Replace account switcher with wallet connector
2. Update `/api/balances` to accept wallet address
3. Modify `print_balances.ts` to query arbitrary addresses
4. Portfolio will automatically work with any connected wallet

### Balance Refresh Triggers
- ✅ On portfolio open
- ✅ On account switch
- ✅ On manual refresh button
- ✅ After order creation (3s delay)
- ✅ After order fill (2s delay)

## Known Limitations

1. **Balance refresh delay:** 2-3 second delay for balance updates (blockchain sync time)
2. **No real-time updates:** Must refresh page to see other users' orders
3. **No rollback:** Failed fills don't automatically rollback partial state
4. **Hardcoded accounts:** Currently uses buyer/seller, not connected wallets

## Future Improvements

1. **Wallet Integration:** Connect MetaMask/Aztec wallet for dynamic accounts
2. **WebSocket Updates:** Real-time order and balance updates
3. **Optimistic UI:** Show pending state before confirmation
4. **Transaction Rollback:** Automatic recovery from partial failures
5. **Price Oracle:** Live USD prices instead of hardcoded
6. **Multi-Token Support:** Dynamic token list from contract registry
