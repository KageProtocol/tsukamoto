"use client";
import { useState, useEffect } from "react";
import { TokenIcon } from "./TokenIcon";
import { formatTokenAmount } from "../../lib/tokens";
import { toast } from "./ToastStack";

export type Transaction = {
  id: string;
  type: "order_created" | "order_filled" | "order_cancelled";
  timestamp: number;
  orderId: string;
  sellTokenAddress: string;
  sellTokenAmount: string;
  buyTokenAddress: string;
  buyTokenAmount: string;
  txHash?: string;
  status: "pending" | "completed" | "failed";
  role: "maker" | "taker"; // maker = created order, taker = filled order
};

type TransactionHistoryProps = {
  transactions: Transaction[];
  onClearHistory?: () => void;
};

// Transaction history storage utilities
export const transactionStorage = {
  getHistory(): Transaction[] {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("otc_transaction_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  addTransaction(transaction: Omit<Transaction, "id" | "timestamp">): Transaction {
    const newTransaction: Transaction = {
      ...transaction,
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    const history = this.getHistory();
    history.unshift(newTransaction); // Add to beginning

    // Keep only last 100 transactions
    const trimmed = history.slice(0, 100);

    if (typeof window !== "undefined") {
      localStorage.setItem("otc_transaction_history", JSON.stringify(trimmed));
    }

    return newTransaction;
  },

  updateTransaction(id: string, updates: Partial<Transaction>): void {
    const history = this.getHistory();
    const index = history.findIndex(tx => tx.id === id);

    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      if (typeof window !== "undefined") {
        localStorage.setItem("otc_transaction_history", JSON.stringify(history));
      }
    }
  },

  clearHistory(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("otc_transaction_history");
    }
  }
};

export default function TransactionHistory({ transactions, onClearHistory }: TransactionHistoryProps) {
  const [filter, setFilter] = useState<"all" | "created" | "filled" | "cancelled">("all");

  const filteredTransactions = transactions.filter(tx => {
    if (filter === "all") return true;
    if (filter === "created") return tx.type === "order_created";
    if (filter === "filled") return tx.type === "order_filled";
    if (filter === "cancelled") return tx.type === "order_cancelled";
    return true;
  });

  const getTransactionIcon = (type: Transaction["type"], status: Transaction["status"]) => {
    if (status === "pending") return "⏳";
    if (status === "failed") return "❌";

    switch (type) {
      case "order_created": return "📝";
      case "order_filled": return "✅";
      case "order_cancelled": return "🚫";
      default: return "📋";
    }
  };

  const getTransactionText = (tx: Transaction) => {
    const sellAmount = formatTokenAmount(tx.sellTokenAmount);
    const buyAmount = formatTokenAmount(tx.buyTokenAmount);

    switch (tx.type) {
      case "order_created":
        return `Created order: Sell ${sellAmount} for ${buyAmount}`;
      case "order_filled":
        return tx.role === "maker"
          ? `Order filled: Received ${buyAmount} for ${sellAmount}`
          : `Filled order: Bought ${sellAmount} for ${buyAmount}`;
      case "order_cancelled":
        return `Cancelled order: ${sellAmount} → ${buyAmount}`;
      default:
        return "Unknown transaction";
    }
  };

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "completed": return "#0c7";
      case "failed": return "#c22";
      case "pending": return "#f59e0b";
      default: return "#9aa3ad";
    }
  };

  const openTransactionScanner = (txHash: string) => {
    // Aztec block explorer integration
    const explorerUrl = `https://explorer.aztec.network/tx/${txHash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="section" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h3 style={{ margin: "0 0 8px 0", color: "#9aa3ad" }}>No Transaction History</h3>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Your completed orders and fills will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Transaction History</h3>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="input"
            style={{ minWidth: 120 }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
          >
            <option value="all">All ({transactions.length})</option>
            <option value="created">Created ({transactions.filter(tx => tx.type === "order_created").length})</option>
            <option value="filled">Filled ({transactions.filter(tx => tx.type === "order_filled").length})</option>
            <option value="cancelled">Cancelled ({transactions.filter(tx => tx.type === "order_cancelled").length})</option>
          </select>
          {onClearHistory && (
            <button
              className="btn btn-sm btn-danger"
              onClick={onClearHistory}
              title="Clear all transaction history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {filteredTransactions.map((tx, index) => (
          <div
            key={tx.id}
            className="row"
            style={{
              padding: "12px 16px",
              borderRadius: 8,
              background: index % 2 === 0 ? "#1a1a1a" : "transparent",
              marginBottom: 4,
              alignItems: "center",
              gap: 12
            }}
          >
            <div style={{ fontSize: 20 }}>
              {getTransactionIcon(tx.type, tx.status)}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 14,
                marginBottom: 4,
                color: "#fff"
              }}>
                {getTransactionText(tx)}
              </div>

              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span style={{
                  fontSize: 12,
                  color: "#9aa3ad"
                }}>
                  {new Date(tx.timestamp).toLocaleString()}
                </span>

                <span style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: getStatusColor(tx.status) + "20",
                  color: getStatusColor(tx.status),
                  textTransform: "uppercase",
                  fontWeight: 600
                }}>
                  {tx.status}
                </span>

                {tx.role && (
                  <span style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: tx.role === "maker" ? "#3b82f620" : "#8b5cf620",
                    color: tx.role === "maker" ? "#3b82f6" : "#8b5cf6",
                    textTransform: "uppercase",
                    fontWeight: 600
                  }}>
                    {tx.role}
                  </span>
                )}
              </div>
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <TokenIcon symbol="ETH" size={16} />
              <span style={{ fontSize: 12, color: "#9aa3ad" }}>→</span>
              <TokenIcon symbol="USDC" size={16} />
            </div>

            <div className="row" style={{ gap: 4 }}>
              {tx.txHash && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => openTransactionScanner(tx.txHash!)}
                    title="View transaction on explorer"
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      background: "#3b82f620",
                      border: "1px solid #3b82f640",
                      color: "#3b82f6"
                    }}
                  >
                    🔍
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => copyToClipboard(tx.txHash!, 'Transaction hash')}
                    title="Copy transaction hash"
                    style={{ padding: "4px 8px", fontSize: 11 }}
                  >
                    📋
                  </button>
                </>
              )}
              {tx.orderId && (
                <button
                  className="btn btn-sm"
                  onClick={() => copyToClipboard(tx.orderId, 'Order ID')}
                  title="Copy order ID"
                  style={{ padding: "4px 8px", fontSize: 11 }}
                >
                  🆔
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}