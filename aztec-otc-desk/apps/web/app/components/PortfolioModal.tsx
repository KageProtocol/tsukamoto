"use client";
import { useState, useEffect } from "react";
import { TokenIcon } from "./TokenIcon";

type TokenBalance = {
  symbol: string;
  balance: string;
  usdValue?: number;
  address: string;
};

type PortfolioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export default function PortfolioModal({
  isOpen,
  onClose,
  onRefresh,
  refreshing
}: PortfolioModalProps) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalUsdValue, setTotalUsdValue] = useState<number>(0);

  // Mock balances for demo - in real implementation, this would fetch from blockchain
  const mockBalances: TokenBalance[] = [
    {
      symbol: "ETH",
      balance: "2.5",
      usdValue: 8750, // 2.5 * 3500
      address: "0x0e480358d5764487114eb224935edd6a1c9ac543ec8e56a221887d2d0ff332f9"
    },
    {
      symbol: "USDC",
      balance: "15000.0",
      usdValue: 15000, // 15000 * 1
      address: "0x127693bf58ba150b04732d0f9cfeb085b3effb37ade0221643108ff4e990f838"
    }
  ];

  const fetchBalances = async () => {
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual balance fetching from the blockchain
      // This would call the balance endpoints for each token

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For now, use mock data
      setBalances(mockBalances);

      // Calculate total USD value
      const total = mockBalances.reduce((sum, token) => sum + (token.usdValue || 0), 0);
      setTotalUsdValue(total);

    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
    }
  }, [isOpen]);

  const handleRefresh = () => {
    fetchBalances();
    onRefresh?.();
  };

  const formatUsdValue = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatBalance = (balance: string, symbol: string) => {
    const num = parseFloat(balance);
    if (num === 0) return "0.00";
    if (num < 0.0001) return "< 0.0001";
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="card" style={{
        width: "100%",
        maxWidth: 500,
        maxHeight: "80vh",
        overflow: "auto",
        margin: 16,
      }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            💰 Portfolio Balance
          </h2>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              title="Refresh balances"
            >
              {loading || refreshing ? "🔄" : "↻"}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: 12,
            background: "#c2212120",
            border: "1px solid #c22121",
            borderRadius: 8,
            marginBottom: 16,
            color: "#c22121"
          }}>
            Failed to load balances: {error}
          </div>
        )}

        <div className="section">
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
            borderRadius: 12,
            border: "1px solid #333",
            marginBottom: 16
          }}>
            <div>
              <div style={{ fontSize: 14, color: "#9aa3ad", marginBottom: 4 }}>
                Total Portfolio Value
              </div>
              <div style={{ fontSize: 28, fontWeight: 600, color: "#fff" }}>
                {loading ? "..." : formatUsdValue(totalUsdValue)}
              </div>
            </div>
            <div style={{ fontSize: 32, opacity: 0.5 }}>
              📊
            </div>
          </div>

          {loading && balances.length === 0 ? (
            <div className="section" style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
              <div style={{ color: "#9aa3ad" }}>Loading balances...</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {balances.map((token) => (
                <div
                  key={token.address}
                  className="row"
                  style={{
                    padding: "12px 16px",
                    background: "#1a1a1a",
                    borderRadius: 8,
                    border: "1px solid #333",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div className="row" style={{ alignItems: "center", gap: 12 }}>
                    <TokenIcon symbol={token.symbol} size={24} />
                    <div>
                      <div style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#fff",
                        marginBottom: 2
                      }}>
                        {token.symbol}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: "#9aa3ad",
                        fontFamily: "monospace"
                      }}>
                        {token.address.substring(0, 6)}...{token.address.substring(token.address.length - 4)}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#fff",
                      marginBottom: 2
                    }}>
                      {formatBalance(token.balance, token.symbol)}
                    </div>
                    {token.usdValue && (
                      <div style={{
                        fontSize: 12,
                        color: "#9aa3ad"
                      }}>
                        {formatUsdValue(token.usdValue)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {balances.length === 0 && !loading && (
            <div className="section" style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
              <div style={{ color: "#9aa3ad", marginBottom: 8 }}>No tokens found</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Make sure you have tokens in your account
              </div>
            </div>
          )}

          <div style={{
            marginTop: 16,
            padding: 12,
            background: "#0f172a",
            borderRadius: 8,
            border: "1px solid #1e293b"
          }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
              🔒 Private Balance Info
            </div>
            <div style={{ fontSize: 11, color: "#475569" }}>
              Balances are fetched from your private Aztec account.
              Only you can see these values thanks to zero-knowledge privacy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}