"use client";
import { TokenIcon } from "./TokenIcon";

export default function TokenBadge({
  symbol,
  address,
  size = 16,
}: {
  symbol: string;
  address?: string;
  size?: number;
}) {
  return (
    <span className="badge">
      <TokenIcon symbol={symbol} size={size} />
      <span style={{ fontWeight: 600, marginRight: 6 }}>{symbol}</span>
      {address ? (
        <span className="muted">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      ) : null}
    </span>
  );
}
