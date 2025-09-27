"use client";
export default function TokenBadge({
  symbol,
  address,
  color = "#5cc8ff",
}: {
  symbol: string;
  address?: string;
  color?: string;
}) {
  return (
    <span className="badge">
      <span
        className="token-dot"
        style={{
          background: color,
          boxShadow: `0 0 0 2px rgba(92,200,255,.15)`,
        }}
      />
      <span style={{ fontWeight: 600, marginRight: 6 }}>{symbol}</span>
      {address ? (
        <span className="muted">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      ) : null}
    </span>
  );
}
