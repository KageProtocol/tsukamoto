"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTokenAmount } from "../lib/tokens";
import Chart from "./components/Chart";
import { OrderListSkeleton } from "./components/Skeleton";
import TokenBadge from "./components/TokenBadge";
import TokenSelect from "./components/TokenSelect";
import { toast } from "./components/ToastStack";
import TransactionHistory, { transactionStorage, Transaction } from "./components/TransactionHistory";
import PortfolioModal from "./components/PortfolioModal";
import { useConfirmDialog } from "./components/ConfirmDialog";
import { OrderStatusWithContext } from "./components/OrderStatusBadge";
import { withErrorHandling, handleApiResponse, StreamToastThrottler } from "../lib/errorHandler";

type Order = {
  orderId: string;
  escrowAddress: string;
  contractInstance: string;
  sellTokenAddress: string;
  sellTokenAmount: string;
  buyTokenAddress: string;
  buyTokenAmount: string;
  status?: string;
  createdAt?: string | number;
  expiresAt?: number;
};

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({
    sell: "",
    buy: "",
    page: 0,
    pageSize: 10,
  });
  const apiUrl = "/api/orders"; // use internal proxy to avoid CORS
  const [activeTab, setActiveTab] = useState<
    "submitted" | "received" | "history"
  >("submitted");
  const [search, setSearch] = useState("");
  const [ticker, setTicker] = useState("ETH-USD");
  const [interval, setInterval] = useState<
    "minute" | "day" | "week" | "month" | "year"
  >("day");
  const [intervalMultiplier, setIntervalMultiplier] = useState(1);
  const [chartType, setChartType] = useState<"area" | "candles">("area");
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const [sellUsd, setSellUsd] = useState<number | null>(null);
  const [buyUsd, setBuyUsd] = useState<number | null>(null);
  const [orderParams, setOrderParams] = useState({
    sellToken: "",
    sellAmount: "",
    buyToken: "",
    buyAmount: "",
    expiry: 24,
    slippageBps: 50,
    minFill: ""
  });
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.sell) qs.set("sell_token_address", filters.sell);
      if (filters.buy) qs.set("buy_token_address", filters.buy);
      qs.set("limit", String(filters.pageSize));
      qs.set("offset", String(filters.page * filters.pageSize));
      const res = await fetch(`${apiUrl}?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to fetch");
      setOrders(json.data || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = () => {
    setTransactions(transactionStorage.getHistory());
  };

  useEffect(() => {
    fetchOrders();
    loadTransactions();
  }, []);

  const fillOrder = async (o: Order) => {
    setActionMsg(null);
    try {
      const res = await fetch("/api/fill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: o.orderId,
          escrowAddress: o.escrowAddress,
          sellTokenAddress: o.sellTokenAddress,
          buyTokenAddress: o.buyTokenAddress,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || "Fill API failed");
      setActionMsg(
        "Fetched include_sensitive order details (server). Ready to trigger local fill.",
      );
      toast.success("Fetched include_sensitive details");
      console.log("/api/fill response", json.data);
    } catch (e) {
      setActionMsg(`Fill error: ${(e as Error).message}`);
      toast.error((e as Error).message);
    }
  };

  // Token registry dropdown helpers - use deployed addresses
  const ETH_ADDR = process.env.NEXT_PUBLIC_ETH_ADDRESS || "0x2166950b7d3921880812624b056024a45e07908b4d1fd51885a759bfd71223ec";
  const USDC_ADDR = process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x10fdd3f2dfdd284aca2bf43cac75023f7ac8fda7fae20f4930680cec37ad92aa";
  const tokenOptions = [
    { label: "ETH", address: ETH_ADDR, ticker: "ETH-USD", decimals: 18 },
    { label: "USDC", address: USDC_ADDR, ticker: "USDC-USD", decimals: 6 },
  ].filter(t => t.address && t.address.trim() !== "");
  const findToken = (addr: string) =>
    tokenOptions.find((t) => t.address?.toLowerCase() === addr?.toLowerCase());

  const renderTabContent = () => {
    if (activeTab === "history") {
      return (
        <TransactionHistory
          transactions={transactions}
          onClearHistory={() => {
            transactionStorage.clearHistory();
            loadTransactions();
            toast.success("Transaction history cleared");
          }}
        />
      );
    }

    if (activeTab === "received") {
      // Filter orders where the user is acting as a buyer/taker
      const receivedOrders = orders.filter(o => {
        // This would typically check if the current user is the intended recipient
        // For now, we'll show all orders as "receivable"
        return true;
      });

      return (
        <div className="section">
          <h3 style={{ margin: "0 0 16px 0" }}>Received Orders</h3>
          <p style={{ color: "#9aa3ad", marginBottom: 16 }}>
            Orders you can fill (buying from other users)
          </p>
          {renderOrdersList(receivedOrders, "received")}
        </div>
      );
    }

    // Default: submitted orders (orders you created)
    return (
      <div className="section">
        <h3 style={{ margin: "0 0 16px 0" }}>Your Submitted Orders</h3>
        <p style={{ color: "#9aa3ad", marginBottom: 16 }}>
          Orders you created (selling your tokens)
        </p>
        {renderOrdersList(orders, "submitted")}
      </div>
    );
  };

  const renderOrdersList = (ordersList: Order[], type: "submitted" | "received") => {
    if (loading) {
      return <OrderListSkeleton />;
    }

    const filteredOrders = ordersList.filter((o) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        o.sellTokenAddress.toLowerCase().includes(q) ||
        o.buyTokenAddress.toLowerCase().includes(q) ||
        (o as any).status?.toLowerCase?.().includes(q)
      );
    });

    if (filteredOrders.length === 0) {
      return (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {type === "submitted" ? "📝" : "📥"}
          </div>
          <h3 style={{ margin: "0 0 8px 0", color: "#9aa3ad" }}>
            {type === "submitted" ? "No orders created" : "No orders available"}
          </h3>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            {type === "submitted"
              ? "Create your first order to start trading"
              : "No orders available to fill right now"
            }
          </p>
        </div>
      );
    }

    return (
      <ul style={{ listStyle: "none", padding: 0 }}>
        {filteredOrders.map((o) => (
          <li
            key={o.orderId}
            style={{
              border: "1px solid #1e1e1e",
              borderRadius: 8,
              padding: 16,
              marginTop: 12,
              background: "#121212",
            }}
          >
            <div style={{ fontWeight: 600 }}>
              Escrow: {o.escrowAddress}
              <span className="copy" onClick={() => copy(o.escrowAddress)}>
                Copy
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span>Sell: {formatTokenAmount(o.sellTokenAddress, o.sellTokenAmount)}</span>
              <TokenBadge
                symbol={findToken(o.sellTokenAddress)?.label || "???"}
                address={o.sellTokenAddress}
              />
              <span className="copy" onClick={() => copy(o.sellTokenAddress)}>
                Copy
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Buy: {formatTokenAmount(o.buyTokenAddress, o.buyTokenAmount)}</span>
              <TokenBadge
                symbol={findToken(o.buyTokenAddress)?.label || "???"}
                address={o.buyTokenAddress}
              />
              <span className="copy" onClick={() => copy(o.buyTokenAddress)}>
                Copy
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div style={{ opacity: 0.75, fontSize: 12 }}>
                Order ID: {o.orderId.substring(0, 8)}...
                <span className="copy" onClick={() => copy(o.orderId)}>
                  Copy
                </span>
              </div>
              <OrderStatusWithContext order={o} size="sm" />
            </div>

            {type === "received" && (
              <>
                <button
                  className="btn btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => fillOrder(o)}
                >
                  Fetch fill details
                </button>
                <button
                  className="btn btn-sm"
                  style={{ marginLeft: 8 }}
                  onClick={async () => {
                    setActionMsg(null);
                    setExecutingId(o.orderId);

                    let hasError = false;
                    let hasSuccess = false;
                    let exitCode = null;
                    let lastMessage = "";

                    try {
                      const resp = await fetch(
                        `/api/fill/stream?orderId=${o.orderId}`,
                      );
                      if (!resp.ok || !resp.body)
                        throw new Error("Stream failed");
                      const reader = resp.body.getReader();
                      const dec = new TextDecoder();

                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = dec.decode(value);
                        const lines = chunk.split(/\n/).filter(Boolean);

                        for (const line of lines) {
                          const message = line.replace(/^data: /, "");
                          lastMessage = message;

                          // Update action message to show progress (UI feedback)
                          if (message && !message.startsWith("done:")) {
                            setActionMsg(message.slice(0, 150));
                          }

                          // Check for completion and exit code
                          if (message.startsWith("done:")) {
                            const code = message.match(/done: (\d+)/)?.[1];
                            exitCode = code ? parseInt(code) : null;
                          }

                          // Check for definitive success indicators
                          if (message.includes("Closed order") || message.includes("Fill operation completed successfully")) {
                            hasSuccess = true;
                          }

                          // Check for real error indicators (only actual errors, not info logs)
                          if (message.includes("[err]") || message.includes("Fill failed:") ||
                              (message.includes("Error") && !message.includes("CREATE ERROR")) ||
                              message.includes("Insufficient balance")) {
                            hasError = true;
                          }

                          // NO TOASTS DURING STREAMING - only show final result at the end
                          // This prevents 100s of toast messages from flooding the UI
                        }
                      }

                      // Determine success based on multiple factors
                      const isSuccess = hasSuccess && !hasError && (exitCode === 0 || exitCode === null);

                      if (isSuccess) {
                        await fetchOrders();
                        setActionMsg("Fill completed successfully. Order closed.");
                        toast.success("Order filled and closed successfully!");

                        // Log successful fill to transaction history
                        transactionStorage.addTransaction({
                          type: "order_filled",
                          orderId: o.orderId,
                          sellTokenAddress: o.sellTokenAddress,
                          sellTokenAmount: o.sellTokenAmount,
                          buyTokenAddress: o.buyTokenAddress,
                          buyTokenAmount: o.buyTokenAmount,
                          status: "completed",
                          role: "taker",
                          txHash: lastMessage.match(/0x[a-fA-F0-9]{64}/)?.[0]
                        });
                        loadTransactions();
                      } else if (hasError || exitCode !== 0) {
                        setActionMsg(`Fill failed (exit code: ${exitCode || 'unknown'})`);
                        toast.error("Fill operation failed - order remains open");
                      } else {
                        setActionMsg("Fill status unclear - check order list");
                        await fetchOrders(); // Refresh to see current state
                      }
                    } catch (e) {
                      setActionMsg(`Execute error: ${(e as Error).message}`);
                      toast.error((e as Error).message);
                    }
                    setExecutingId(null);
                  }}
                  disabled={executingId === o.orderId}
                >
                  {executingId === o.orderId
                    ? "Executing..."
                    : "Execute Local Fill"}
                </button>
              </>
            )}

            <Link href={`/order/${o.orderId}`} style={{ float: "right" }}>
              Details →
            </Link>

            {type === "submitted" && (
              <button
                className="btn btn-sm btn-danger"
                style={{ marginLeft: 8 }}
                onClick={withErrorHandling(async () => {
                  const confirmed = await confirm({
                    title: "Cancel Order",
                    message: `Are you sure you want to cancel this order?\n\nSelling: ${formatTokenAmount(o.sellTokenAddress, o.sellTokenAmount)}\nFor: ${formatTokenAmount(o.buyTokenAddress, o.buyTokenAmount)}\n\nThis action cannot be undone.`,
                    confirmText: "Yes, Cancel Order",
                    cancelText: "Keep Order",
                    type: "danger"
                  });

                  if (!confirmed) return;

                  setActionMsg(null);
                  const res = await fetch("/api/order/cancel", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ orderId: o.orderId }),
                  });

                  const json = await handleApiResponse(res, { errorPrefix: "Cancel failed" });

                  toast.success("Order cancelled");
                  // Log cancellation to history
                  transactionStorage.addTransaction({
                    type: "order_cancelled",
                    orderId: o.orderId,
                    sellTokenAddress: o.sellTokenAddress,
                    sellTokenAmount: o.sellTokenAmount,
                    buyTokenAddress: o.buyTokenAddress,
                    buyTokenAmount: o.buyTokenAmount,
                    status: "completed",
                    role: "maker"
                  });
                  loadTransactions();
                  setTimeout(fetchOrders, 500);
                }, { errorMessage: "Failed to cancel order", showToast: true })}
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  };

  async function loadUsdHint(addr: string, setFn: (v: number | null) => void) {
    const token = findToken(addr);
    if (!token) {
      setFn(null);
      return;
    }
    try {
      const res = await fetch(`/api/price?ticker=${encodeURIComponent(token.ticker)}`);
      const json = await res.json();
      setFn(json?.success ? json.price : null);
    } catch {
      setFn(null);
    }
  }

  const calculateMarketPrice = async (direction: "sell" | "buy") => {
    if (!orderParams.sellToken || !orderParams.buyToken) {
      toast.error("Please select both tokens first");
      return;
    }

    const amount = direction === "sell" ? orderParams.sellAmount : orderParams.buyAmount;
    if (!amount || Number(amount) <= 0) {
      toast.error(`Please enter a valid ${direction} amount`);
      return;
    }

    const fromToken = direction === "sell" ? orderParams.sellToken : orderParams.buyToken;
    const toToken = direction === "sell" ? orderParams.buyToken : orderParams.sellToken;

    const fromTokenData = tokenOptions.find(t => t.address === fromToken);
    const toTokenData = tokenOptions.find(t => t.address === toToken);

    if (!fromTokenData || !toTokenData) return;

    try {
      const [fromPriceRes, toPriceRes] = await Promise.all([
        fetch(`/api/price?ticker=${fromTokenData.ticker}`),
        fetch(`/api/price?ticker=${toTokenData.ticker}`)
      ]);

      const [fromPriceData, toPriceData] = await Promise.all([
        fromPriceRes.json(),
        toPriceRes.json()
      ]);

      const fromPrice = fromPriceData?.success ? fromPriceData.price : null;
      const toPrice = toPriceData?.success ? toPriceData.price : null;

      if (fromPrice && toPrice) {
        const exchangeRate = fromPrice / toPrice;
        const calculatedAmount = (Number(amount) * exchangeRate).toFixed(6);

        if (direction === "sell") {
          setOrderParams(prev => ({ ...prev, buyAmount: calculatedAmount }));
          toast.success(`Calculated ${calculatedAmount} ${toTokenData.label} at market price`);
        } else {
          setOrderParams(prev => ({ ...prev, sellAmount: calculatedAmount }));
          toast.success(`Calculated ${calculatedAmount} ${toTokenData.label} at market price`);
        }
      } else {
        toast.error("Failed to fetch market prices");
      }
    } catch (error) {
      toast.error("Error calculating market price");
    }
  };

  const validateOrder = (): boolean => {
    const errors: Record<string, string> = {};

    if (!orderParams.sellToken) errors.sellToken = "Sell token is required";
    if (!orderParams.buyToken) errors.buyToken = "Buy token is required";
    if (!orderParams.sellAmount || Number(orderParams.sellAmount) <= 0) {
      errors.sellAmount = "Please enter a valid sell amount";
    }
    if (!orderParams.buyAmount || Number(orderParams.buyAmount) <= 0) {
      errors.buyAmount = "Please enter a valid buy amount";
    }
    if (orderParams.sellToken === orderParams.buyToken) {
      errors.buyToken = "Buy token must be different from sell token";
    }

    setOrderErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createOrder = async () => {
    if (!validateOrder()) return;

    setCreatingOrder(true);
    try {
      const payload = {
        sellTokenAddress: orderParams.sellToken,
        sellTokenAmount: orderParams.sellAmount,
        buyTokenAddress: orderParams.buyToken,
        buyTokenAmount: orderParams.buyAmount,
        expiryHours: orderParams.expiry,
        slippageBps: orderParams.slippageBps,
        // Include minFillAmount if specified
        ...(orderParams.minFill && { minFillAmount: orderParams.minFill })
      };

      const res = await fetch("/api/order/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      // Handle standardized error responses
      if (!json.success) {
        // Display user-friendly error message based on error code
        let errorMessage = json.userMessage || json.error || "Order creation failed";

        switch (json.code) {
          case "INSUFFICIENT_BALANCE":
            errorMessage = "Insufficient balance. Please mint tokens and try again.";
            break;
          case "INVALID_TOKEN":
            errorMessage = "Invalid token selected. Please choose a different token.";
            break;
          case "VALIDATION_ERROR":
            errorMessage = "Please check your order parameters and try again.";
            if (Array.isArray(json.details)) {
              errorMessage = json.details[0]; // Show first validation error
            }
            break;
          case "NETWORK_ERROR":
            errorMessage = "Network issue. Please check your connection and retry.";
            break;
          case "DUPLICATE_ORDER":
            errorMessage = "Similar order already exists. Check your order history.";
            break;
        }

        toast.error(errorMessage);
        console.error("Order creation failed:", json);
        return;
      }

      // Success handling
      const orderId = json.orderId || `order_${Date.now()}`;
      toast.success(`Order created successfully! ID: ${orderId.slice(0, 8)}...`);

      // Log transaction to history
      transactionStorage.addTransaction({
        type: "order_created",
        orderId,
        sellTokenAddress: orderParams.sellToken,
        sellTokenAmount: orderParams.sellAmount,
        buyTokenAddress: orderParams.buyToken,
        buyTokenAmount: orderParams.buyAmount,
        status: "completed",
        role: "maker"
      });
      loadTransactions();

      // Reset form
      setOrderParams({
        sellToken: "",
        sellAmount: "",
        buyToken: "",
        buyAmount: "",
        expiry: 24,
        slippageBps: 50,
        minFill: ""
      });
      setSellUsd(null);
      setBuyUsd(null);
      setOrderErrors({});

      // Refresh orders list
      await fetchOrders();

    } catch (e) {
      // Handle network/parsing errors
      const errorMessage = (e as Error).message;
      toast.error(errorMessage.includes("fetch")
        ? "Connection failed. Please check your network."
        : "An unexpected error occurred. Please try again."
      );
      console.error("Order creation error:", e);
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <main className="container">
      <div className="header">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand">Tsukamoto OTC</div>
          <span className="brand-badge">Aztec Private</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => setShowPortfolio(true)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            💰 Portfolio
          </button>
          <span className="pill">Sandbox</span>
        </div>
      </div>
      <div className="hero">Fast. Private. OTC on Aztec.</div>
      <p className="muted">
        Listing public orders from {apiUrl}. Click refresh to reload.
      </p>
      <div className="row sticky" style={{ gap: 8 }}>
        <button className="btn" onClick={fetchOrders} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
        <button
          className="btn btn-danger"
          onClick={withErrorHandling(async () => {
            setActionMsg(null);
            const res = await fetch("/api/order/cancel-all", {
              method: "POST",
            });
            const json = await handleApiResponse(res, { errorPrefix: "Cancel all failed" });
            toast.success(`Cancelled ${json.count ?? "open"} orders`);
            await fetchOrders();
          }, { errorMessage: "Failed to cancel all orders", showToast: true })}
          style={{ marginLeft: "auto" }}
        >
          Cancel All
        </button>
      </div>
      <div className="trading-grid">
        {/* Enhanced Trading Terminal */}
        <div className="card trading-terminal">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <div className="pill">Create Order</div>
            <div className="toolbar">
              <span className="pill">Aztec</span>
            </div>
          </div>

          {/* Sell Token Section */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#9aa3ad", marginBottom: 6 }}>
              You're Selling
            </div>
            <TokenSelect
              value={orderParams.sellToken}
              onChange={(value) => {
                setOrderParams({ ...orderParams, sellToken: value });
                void loadUsdHint(value, setSellUsd);
                setOrderErrors(prev => ({ ...prev, sellToken: "" }));
              }}
              options={tokenOptions}
              placeholder="Select token to sell..."
            />
            {orderErrors.sellToken && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0 0" }}>{orderErrors.sellToken}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="0.0"
                value={orderParams.sellAmount}
                onChange={(e) => {
                  setOrderParams({ ...orderParams, sellAmount: e.target.value });
                  setOrderErrors(prev => ({ ...prev, sellAmount: "" }));
                }}
                style={{ flex: 1 }}
              />
              <span
                className="pill"
                style={{ minWidth: 90, textAlign: "center", fontSize: 11 }}
              >
                {sellUsd && orderParams.sellAmount
                  ? `$${(Number(orderParams.sellAmount || 0) * Number(sellUsd || 0)).toLocaleString()}`
                  : "$0.00"}
              </span>
            </div>
            {orderErrors.sellAmount && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0 0" }}>{orderErrors.sellAmount}</p>}
          </div>

          {/* Market Price Button */}
          {orderParams.sellToken && orderParams.buyToken && orderParams.sellAmount && (
            <div style={{ marginBottom: 16 }}>
              <button
                className="btn btn-sm"
                onClick={() => calculateMarketPrice("sell")}
                style={{ width: "100%", fontSize: 11, padding: "6px 8px" }}
              >
                📈 Calculate at Market Price
              </button>
            </div>
          )}

          {/* Buy Token Section */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#9aa3ad", marginBottom: 6 }}>
              You're Receiving
            </div>
            <TokenSelect
              value={orderParams.buyToken}
              onChange={(value) => {
                setOrderParams({ ...orderParams, buyToken: value });
                void loadUsdHint(value, setBuyUsd);
                setOrderErrors(prev => ({ ...prev, buyToken: "" }));
              }}
              options={tokenOptions}
              placeholder="Select token to receive..."
            />
            {orderErrors.buyToken && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0 0" }}>{orderErrors.buyToken}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="0.0"
                value={orderParams.buyAmount}
                onChange={(e) => {
                  setOrderParams({ ...orderParams, buyAmount: e.target.value });
                  setOrderErrors(prev => ({ ...prev, buyAmount: "" }));
                }}
                style={{ flex: 1 }}
              />
              <span
                className="pill"
                style={{ minWidth: 90, textAlign: "center", fontSize: 11 }}
              >
                {buyUsd && orderParams.buyAmount
                  ? `$${(Number(orderParams.buyAmount || 0) * Number(buyUsd || 0)).toLocaleString()}`
                  : "$0.00"}
              </span>
            </div>
            {orderErrors.buyAmount && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0 0" }}>{orderErrors.buyAmount}</p>}
          </div>

          {/* Exchange Rate Display */}
          {orderParams.sellAmount && orderParams.buyAmount && Number(orderParams.sellAmount) > 0 && Number(orderParams.buyAmount) > 0 && (
            <div style={{ marginBottom: 16, padding: 10, background: "#1a1a1a", borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "#9aa3ad", marginBottom: 2 }}>Exchange Rate</div>
              <div style={{ fontSize: 12 }}>
                1 {findToken(orderParams.sellToken)?.label} = {(Number(orderParams.buyAmount) / Number(orderParams.sellAmount)).toFixed(4)} {findToken(orderParams.buyToken)?.label}
              </div>
            </div>
          )}

          {/* Order Settings */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#9aa3ad", marginBottom: 6 }}>Settings</div>
            <div className="row" style={{ gap: 6 }}>
              <select
                className="input"
                value={orderParams.expiry}
                onChange={(e) => setOrderParams({ ...orderParams, expiry: Number(e.target.value) })}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}
              >
                <option value={1}>1h</option>
                <option value={6}>6h</option>
                <option value={24}>24h</option>
                <option value={72}>3d</option>
                <option value={168}>1w</option>
              </select>
              <select
                className="input"
                value={orderParams.slippageBps}
                onChange={(e) => setOrderParams({ ...orderParams, slippageBps: Number(e.target.value) })}
                style={{ flex: 1, fontSize: 11, padding: "6px 8px" }}
              >
                <option value={10}>0.1%</option>
                <option value={50}>0.5%</option>
                <option value={100}>1%</option>
                <option value={250}>2.5%</option>
              </select>
            </div>
          </div>

          {/* Create Order Button */}
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={createOrder}
              disabled={creatingOrder}
              style={{ width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 600 }}
            >
              {creatingOrder ? "Creating..." : "Create Order"}
            </button>
          </div>

          {/* Quick Actions */}
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm"
              onClick={fetchOrders}
              disabled={loading}
              style={{ flex: 1, fontSize: 10, padding: "4px 8px" }}
            >
              {loading ? "..." : "🔄"}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setOrderParams({
                  sellToken: "",
                  sellAmount: "",
                  buyToken: "",
                  buyAmount: "",
                  expiry: 24,
                  slippageBps: 50,
                  minFill: ""
                });
                setSellUsd(null);
                setBuyUsd(null);
                setOrderErrors({});
              }}
              style={{ flex: 1, fontSize: 10, padding: "4px 8px" }}
            >
              🗑️
            </button>
          </div>
        </div>

        {/* Chart Area */}
        <div className="chart-area">
          <div className="chart-controls">
            <select
              className="input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="ETH-USD">ETH-USD</option>
              <option value="BTC-USD">BTC-USD</option>
              <option value="SOL-USD">SOL-USD</option>
            </select>
            <select
              className="input"
              value={interval}
              onChange={(e) => setInterval(e.target.value as any)}
              style={{ width: 100 }}
            >
              <option value="minute">1m</option>
              <option value="day">1d</option>
              <option value="week">1w</option>
              <option value="month">1M</option>
            </select>
            <select
              className="input"
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              style={{ width: 100 }}
            >
              <option value="area">Area</option>
              <option value="candles">Candles</option>
            </select>
          </div>
          <Chart
            ticker={ticker}
            interval={interval}
            intervalMultiplier={intervalMultiplier}
            type={chartType}
          />

          {/* Order History under chart */}
          <div style={{ marginTop: 24 }}>
            <div className="tabs" style={{ marginBottom: 16 }}>
              {(["submitted", "received", "history"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`tab ${activeTab === t ? "active" : ""}`}
                >
                  {t === "submitted"
                    ? "My Orders"
                    : t === "received"
                      ? "Available Orders"
                      : "Transaction History"}
                </button>
              ))}
            </div>
            {renderTabContent()}
          </div>
        </div>
      </div>
      <div className="footer">
        <button
          className="btn"
          onClick={() => {
            if (filters.page === 0) return;
            const p = Math.max(0, filters.page - 1);
            setFilters({ ...filters, page: p });
            fetchOrders();
          }}
          disabled={filters.page === 0}
        >
          Prev
        </button>
        <span style={{ opacity: 0.75 }}>Page {filters.page + 1}</span>
        <button
          className="btn"
          onClick={() => {
            const p = filters.page + 1;
            setFilters({ ...filters, page: p });
            fetchOrders();
          }}
          disabled={orders.length < filters.pageSize}
        >
          Next
        </button>
        <select
          className="input"
          style={{ width: 100 }}
          value={filters.pageSize}
          onChange={(e) => {
            const size = Number(e.target.value);
            setFilters({ ...filters, pageSize: size, page: 0 });
            fetchOrders();
          }}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      {actionMsg && <p style={{ marginTop: 12 }}>{actionMsg}</p>}

      <ConfirmDialogComponent />
      <PortfolioModal
        isOpen={showPortfolio}
        onClose={() => setShowPortfolio(false)}
        onRefresh={() => {
          setBalanceRefreshing(true);
          setTimeout(() => setBalanceRefreshing(false), 2000);
        }}
        refreshing={balanceRefreshing}
      />
    </main>
  );
}
