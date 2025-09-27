"use client";
import { TokenIcon } from "./TokenIcon";

type TokenOption = {
  label: string;
  address: string;
  ticker: string;
  decimals: number;
};

export default function TokenSelect({
  value,
  onChange,
  options,
  placeholder = "Select token...",
}: {
  value: string;
  onChange: (value: string) => void;
  options: TokenOption[];
  placeholder?: string;
}) {
  // Filter out tokens with empty addresses and find selected token
  const validOptions = options.filter(t => t.address && t.address.trim() !== "");
  const selectedToken = validOptions.find(t =>
    t.address && value && t.address.toLowerCase() === value.toLowerCase()
  );

  return (
    <div style={{ position: "relative" }}>
      <select
        className="input"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          paddingLeft: selectedToken ? "40px" : "12px",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23666' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: "right 8px center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "16px",
        }}
      >
        <option value="">{placeholder}</option>
        {validOptions.map((token) => (
          <option key={token.label} value={token.address}>
            {token.label} ({token.address?.slice(0, 6)}…{token.address?.slice(-4)})
          </option>
        ))}
      </select>
      {selectedToken && (
        <div style={{
          position: "absolute",
          left: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}>
          <TokenIcon symbol={selectedToken.label} size={16} />
        </div>
      )}
    </div>
  );
}