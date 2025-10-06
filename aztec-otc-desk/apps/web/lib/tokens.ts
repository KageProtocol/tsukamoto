type TokenMeta = {
  address: string;
  symbol: string;
  decimals: number;
};

const REGISTRY: TokenMeta[] = [
  ...(process.env.NEXT_PUBLIC_ETH_ADDRESS
    ? [
        {
          address: String(process.env.NEXT_PUBLIC_ETH_ADDRESS).toLowerCase(),
          symbol: "ETH",
          decimals: 18,
        },
      ]
    : []),
  ...(process.env.NEXT_PUBLIC_USDC_ADDRESS
    ? [
        {
          address: String(process.env.NEXT_PUBLIC_USDC_ADDRESS).toLowerCase(),
          symbol: "USDC",
          decimals: 6,
        },
      ]
    : []),
];

export function getTokenMeta(address: string | undefined | null): TokenMeta | null {
  if (!address) return null;
  const addr = address.toLowerCase();
  const found = REGISTRY.find((t) => t.address === addr);
  return found || null;
}

export function formatTokenAmount(address: string, raw: string): string {
  const meta = getTokenMeta(address);
  const decimals = meta?.decimals ?? 18;
  const symbol = meta?.symbol ?? "";
  try {
    const bn = BigInt(raw);
    const base = BigInt(10) ** BigInt(decimals);
    const whole = bn / base;
    const frac = bn % base;

    // Format whole part with commas for readability
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Format fractional part more cleanly
    if (frac === BigInt(0)) {
      // No decimal places if it's a whole number
      return `${wholeStr}${symbol ? ` ${symbol}` : ""}`;
    }

    // Show up to 4 significant decimal places, trimming trailing zeros
    const fracStr = frac.toString().padStart(decimals, "0");
    let significantFrac = fracStr.slice(0, 4);
    // Trim trailing zeros
    significantFrac = significantFrac.replace(/0+$/, "");

    if (significantFrac === "") {
      return `${wholeStr}${symbol ? ` ${symbol}` : ""}`;
    }

    return `${wholeStr}.${significantFrac}${symbol ? ` ${symbol}` : ""}`;
  } catch {
    return raw;
  }
}


