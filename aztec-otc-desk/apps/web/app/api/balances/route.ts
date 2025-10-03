import "server-only";
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
import { getPXEClient } from '@/lib/pxe-client';
import { TokenContract } from '@aztec-otc-desk/contracts';
import { AztecAddress } from '@aztec/aztec.js';

// Cached balances as fallback
const cachedBalances: Record<string, { eth: string; usdc: string; timestamp: number }> = {};
const CACHE_TTL = 30000; // 30 seconds

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountType = url.searchParams.get("account") || "buyer";

  const ethAddress = process.env.NEXT_PUBLIC_ETH_ADDRESS || "";
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS || "";

  if (!ethAddress || !usdcAddress) {
    return Response.json(
      { success: false, error: "Token addresses not configured" },
      { status: 500 }
    );
  }

  const formatBalance = (wei: string, decimals: number) => {
    const num = BigInt(wei);
    const divisor = BigInt(10 ** decimals);
    const whole = num / divisor;
    const remainder = num % divisor;
    const decimal = remainder.toString().padStart(decimals, "0");
    return `${whole}.${decimal.slice(0, 6)}`;
  };

  // Check cache first
  const cached = cachedBalances[accountType];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Response.json({
      success: true,
      data: [
        {
          symbol: "ETH",
          address: ethAddress,
          balance: formatBalance(cached.eth, 18),
          balanceRaw: cached.eth,
        },
        {
          symbol: "USDC",
          address: usdcAddress,
          balance: formatBalance(cached.usdc, 6),
          balanceRaw: cached.usdc,
        },
      ],
      cached: true,
    });
  }

  // Try to fetch fresh balances with 5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const fetchPromise = (async () => {
      const pxe = await getPXEClient();
      const { getInitialTestAccountsManagers } = await import('@aztec/accounts/testing');
      const accountManagers = await getInitialTestAccountsManagers(pxe);

      const accountIndex = accountType === "seller" ? 0 : 1;
      const accountManager = accountManagers[accountIndex];

      if (!accountManager) throw new Error(`Account not found`);

      const wallet = await accountManager.register();
      const walletAddress = wallet.getAddress().toString();

      const ethToken = await TokenContract.at(AztecAddress.fromString(ethAddress), wallet);
      const usdcToken = await TokenContract.at(AztecAddress.fromString(usdcAddress), wallet);

      const [ethBalance, usdcBalance] = await Promise.all([
        ethToken.methods.balance_of_private(wallet.getAddress()).simulate(),
        usdcToken.methods.balance_of_private(wallet.getAddress()).simulate(),
      ]);

      return { ethBalance, usdcBalance, walletAddress };
    })();

    const result = await fetchPromise;
    clearTimeout(timeoutId);

    // Cache the result
    cachedBalances[accountType] = {
      eth: result.ethBalance.toString(),
      usdc: result.usdcBalance.toString(),
      timestamp: Date.now(),
    };

    return Response.json({
      success: true,
      data: [
        {
          symbol: "ETH",
          address: ethAddress,
          balance: formatBalance(result.ethBalance.toString(), 18),
          balanceRaw: result.ethBalance.toString(),
        },
        {
          symbol: "USDC",
          address: usdcAddress,
          balance: formatBalance(result.usdcBalance.toString(), 6),
          balanceRaw: result.usdcBalance.toString(),
        },
      ],
      walletAddress: result.walletAddress,
    });
  } catch (error: any) {
    console.error("Balance fetch error:", error);

    // Return cached if available
    if (cached) {
      return Response.json({
        success: true,
        data: [
          {
            symbol: "ETH",
            address: ethAddress,
            balance: formatBalance(cached.eth, 18),
            balanceRaw: cached.eth,
          },
          {
            symbol: "USDC",
            address: usdcAddress,
            balance: formatBalance(cached.usdc, 6),
            balanceRaw: cached.usdc,
          },
        ],
        cached: true,
        stale: true,
      });
    }

    // No cache, return error
    return Response.json(
      {
        success: false,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message,
      },
      { status: 500 }
    );
  }
}
