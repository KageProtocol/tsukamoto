import "server-only";
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
import { getPXEClient } from '@/lib/pxe-client';
import { TokenContract } from '@aztec-otc-desk/contracts';
import { AztecAddress } from '@aztec/aztec.js';

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

  try {
    const pxe = await getPXEClient();

    // Get initial test accounts (for sandbox)
    const { getInitialTestAccountsManagers } = await import('@aztec/accounts/testing');
    const accountManagers = await getInitialTestAccountsManagers(pxe);

    // For sandbox: first account is seller, second is buyer
    const accountIndex = accountType === "seller" ? 0 : 1;
    const accountManager = accountManagers[accountIndex];

    if (!accountManager) {
      throw new Error(`Account not found for ${accountType}`);
    }

    // Get wallet from account manager
    const wallet = await accountManager.register();
    const walletAddress = wallet.getAddress().toString();

    // Get token contracts
    const ethToken = await TokenContract.at(
      AztecAddress.fromString(ethAddress),
      wallet
    );
    const usdcToken = await TokenContract.at(
      AztecAddress.fromString(usdcAddress),
      wallet
    );

    // Query balances in parallel
    const [ethBalance, usdcBalance] = await Promise.all([
      ethToken.methods.balance_of_private(wallet.getAddress()).simulate(),
      usdcToken.methods.balance_of_private(wallet.getAddress()).simulate(),
    ]);

    const formatBalance = (wei: string, decimals: number) => {
      const num = BigInt(wei);
      const divisor = BigInt(10 ** decimals);
      const whole = num / divisor;
      const remainder = num % divisor;
      const decimal = remainder.toString().padStart(decimals, "0");
      return `${whole}.${decimal.slice(0, 6)}`;
    };

    return Response.json({
      success: true,
      data: [
        {
          symbol: "ETH",
          address: ethAddress,
          balance: formatBalance(ethBalance.toString(), 18),
          balanceRaw: ethBalance.toString(),
        },
        {
          symbol: "USDC",
          address: usdcAddress,
          balance: formatBalance(usdcBalance.toString(), 6),
          balanceRaw: usdcBalance.toString(),
        },
      ],
      walletAddress,
    });
  } catch (error: any) {
    console.error("Balance fetch error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to fetch balances",
        details: error.toString()
      },
      { status: 500 }
    );
  }
}
