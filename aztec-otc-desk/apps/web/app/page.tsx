"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTokenAmount } from "../lib/tokens";
import Chart from "./components/Chart";
import {
  Wallet,
  Coins,
  RefreshCw,
  Trash2,
  FileText,
  Download,
  Info,
  Plug,
  TrendingUp
} from "lucide-react";
import { OrderListSkeleton } from "./components/Skeleton";
import TokenBadge from "./components/TokenBadge";
import TokenSelect from "./components/TokenSelect";
import { toast } from "./components/ToastStack";
import TransactionHistory, { transactionStorage, Transaction } from "./components/TransactionHistory";
import PortfolioModal from "./components/PortfolioModal";
import { useConfirmDialog } from "./components/ConfirmDialog";
import { OrderStatusWithContext } from "./components/OrderStatusBadge";
import { withErrorHandling, handleApiResponse, StreamToastThrottler } from "../lib/errorHandler";
import WalletConnect from "./components/WalletConnect";
import { useWallet } from "@/lib/wallet-provider";
import { useOrderEvents } from "./hooks/useOrderEvents";

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
  minFillAmount?: string;
  maxSlippageBps?: number;
};

export default function Home() {
  const { wallet, address, accountIndex, isConnected } = useWallet();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_OTC_API_URL || "http://localhost:3001";

  // Real-time order updates via SSE
  const { connected: sseConnected } = useOrderEvents({
    onOrderCreated: (orderId, data) => {
      console.log('[SSE] Order created:', orderId);
      toast.success('New order available!');
      fetchOrders(); // Refresh orders list
    },
    onOrderFilled: (orderId, data) => {
      console.log('[SSE] Order filled:', orderId);
      toast.success('Order filled!');
      fetchOrders(); // Refresh orders list
      setBalanceRefreshing(true);
      setPortfolioKey(prev => prev + 1); // Force portfolio refresh
    },
    onOrderCancelled: (orderId, data) => {
      console.log('[SSE] Order cancelled:', orderId);
      toast.info('Order cancelled');
      fetchOrders(); // Refresh orders list
    },
    onOrderUpdated: (orderId, data) => {
      console.log('[SSE] Order updated:', orderId);
      fetchOrders(); // Refresh orders list
    },
    onConnected: () => {
      console.log('[SSE] Connected to real-time updates');
    },
    apiUrl
  });
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [fetchingDetailsId, setFetchingDetailsId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({
    sell: "",
    buy: "",
    status: "",
    sellToken: undefined as string | undefined,
    buyToken: undefined as string | undefined,
    search: undefined as string | undefined,
    page: 0,
    limit: 10,
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
  const [portfolioKey, setPortfolioKey] = useState(0); // Force re-render of portfolio
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  // Live price updates for order creation form
  useEffect(() => {
    // Initial price load
    if (orderParams.sellToken) {
      loadUsdHint(orderParams.sellToken, setSellUsd);
    }
    if (orderParams.buyToken) {
      loadUsdHint(orderParams.buyToken, setBuyUsd);
    }

    // Set up 30-second interval for live updates
    const priceInterval = setInterval(() => {
      if (orderParams.sellToken) {
        loadUsdHint(orderParams.sellToken, setSellUsd);
      }
      if (orderParams.buyToken) {
        loadUsdHint(orderParams.buyToken, setBuyUsd);
      }
    }, 30000);

    // Cleanup interval on unmount or when tokens change
    return () => clearInterval(priceInterval);
  }, [orderParams.sellToken, orderParams.buyToken]);

  // Auto-calculate market price when sell amount changes
  useEffect(() => {
    const autoCalc = async () => {
      if (!orderParams.sellToken || !orderParams.buyToken || !orderParams.sellAmount) {
        return;
      }

      const amount = orderParams.sellAmount;
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        return;
      }

      const fromToken = tokenOptions.find(t => t.address === orderParams.sellToken);
      const toToken = tokenOptions.find(t => t.address === orderParams.buyToken);

      if (!fromToken || !toToken) return;

      try {
        const [fromPriceRes, toPriceRes] = await Promise.all([
          fetch(`/api/price?ticker=${fromToken.ticker}`),
          fetch(`/api/price?ticker=${toToken.ticker}`)
        ]);

        if (!fromPriceRes.ok || !toPriceRes.ok) return;

        const [fromPriceData, toPriceData] = await Promise.all([
          fromPriceRes.json(),
          toPriceRes.json()
        ]);

        if (fromPriceData.success && toPriceData.success) {
          const fromPrice = fromPriceData.price;
          const toPrice = toPriceData.price;

          const totalValue = Number(amount) * fromPrice;
          const calculatedAmount = (totalValue / toPrice).toFixed(4);

          setOrderParams(prev => ({ ...prev, buyAmount: calculatedAmount }));
        }
      } catch {
        // Silently fail for auto-calculation
      }
    };

    // Debounce the calculation
    const timer = setTimeout(() => {
      autoCalc();
    }, 500);

    return () => clearTimeout(timer);
  }, [orderParams.sellToken, orderParams.buyToken, orderParams.sellAmount]);

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
      if (filters.status) qs.set("status", filters.status);
      qs.set("limit", String(filters.pageSize));
      qs.set("offset", String(filters.page * filters.pageSize));
      const res = await fetch(`${apiUrl}?${qs.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to fetch");

      // Filter orders to only show those with current token addresses
      const validOrders = (json.data || []).filter((order: any) => {
        const sellAddr = order.sellTokenAddress?.toLowerCase();
        const buyAddr = order.buyTokenAddress?.toLowerCase();
        const validSellAddrs = [ETH_ADDR.toLowerCase(), USDC_ADDR.toLowerCase()];
        const validBuyAddrs = [ETH_ADDR.toLowerCase(), USDC_ADDR.toLowerCase()];
        return validSellAddrs.includes(sellAddr) && validBuyAddrs.includes(buyAddr);
      });

      setOrders(validOrders);
    } catch (e) {
      const errorMsg = (e as Error).message;
      setError(errorMsg);
      toast.error(`Failed to load orders: ${errorMsg}`);
      console.error("Fetch orders error:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = () => {
    setTransactions(transactionStorage.getHistory());
  };

  // Handle real-time order events via SSE
  const handleOrderEvent = (event: OrderEvent) => {
    console.log('[Order Event]', event.type, event);

    if (event.type === 'connected') {
      console.log('[SSE] Connected to real-time order updates');
      return;
    }

    // Refresh orders on any order event
    if (event.type === 'order_created' ||
        event.type === 'order_updated' ||
        event.type === 'order_filled' ||
        event.type === 'order_cancelled') {
      fetchOrders();

      // Trigger live balance update on order filled
      if (event.type === 'order_filled') {
        console.log('[Balance] Order filled - refreshing balances');
        setPortfolioKey(prev => prev + 1); // Force portfolio to refetch
        toast.success('Order filled - balances updated');
      } else if (event.type === 'order_created') {
        toast.info('New order created');
      } else if (event.type === 'order_cancelled') {
        toast.info('Order cancelled');
      }
    }
  };

  // Subscribe to real-time order events
  useOrderEvents(handleOrderEvent, {
    autoReconnect: true,
    reconnectInterval: 3000
  });

  useEffect(() => {
    fetchOrders();
    loadTransactions();
  }, []);

  const fillOrder = async (o: Order) => {
    // Check wallet connection first
    if (!address || accountIndex === null) {
      toast.error("Please connect your wallet to fill orders");
      return;
    }

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
          walletAddress: address,
          accountIndex: accountIndex,
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
      const errorMsg = (e as Error).message;
      setActionMsg(`Fill error: ${errorMsg}`);
      toast.error(`Failed to fetch fill details: ${errorMsg}`);
      console.error("Fill order error:", e);
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

  // Client-side search filter
  const applySearch = (orderList: Order[]) => {
    if (!filters.search || filters.search.trim() === "") {
      return orderList;
    }

    const searchLower = filters.search.toLowerCase().trim();
    return orderList.filter(o =>
      o.orderId.toLowerCase().includes(searchLower) ||
      o.escrowAddress.toLowerCase().includes(searchLower) ||
      (o.sellTokenAddress && o.sellTokenAddress.toLowerCase().includes(searchLower)) ||
      (o.buyTokenAddress && o.buyTokenAddress.toLowerCase().includes(searchLower))
    );
  };

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
      // Only show open/pending orders in available section
      let receivedOrders = orders.filter(o => {
        const status = o.status?.toLowerCase();
        return !status || status === 'open' || status === 'pending';
      });

      // Apply search filter
      receivedOrders = applySearch(receivedOrders);

      return (
        <div className="section">
          <h3 style={{ margin: "0 0 16px 0" }}>Available Orders</h3>
          <p style={{ color: "#9aa3ad", marginBottom: 16 }}>
            Open orders you can fill
          </p>
          {renderOrdersList(receivedOrders, "received")}
        </div>
      );
    }

    // Default: submitted orders (orders you created) - show all
    let submittedOrders = applySearch(orders);

    return (
      <div className="section">
        <h3 style={{ margin: "0 0 16px 0" }}>Your Orders</h3>
        <p style={{ color: "#9aa3ad", marginBottom: 16 }}>
          Orders you created
        </p>
        {renderOrdersList(submittedOrders, "submitted")}
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
            {type === "submitted" ? <FileText size={16} /> : <Download size={16} />}
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
            <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {o.expiresAt && (
                <span>
                  Expires: {new Date(o.expiresAt * 1000).toLocaleString()}
                  {o.expiresAt * 1000 < Date.now() && (
                    <span style={{ color: "#ef4444", marginLeft: 6 }}>• Expired</span>
                  )}
                </span>
              )}
              {o.minFillAmount && (
                <span>Min Fill: {formatTokenAmount(o.sellTokenAddress, o.minFillAmount)}</span>
              )}
              {o.maxSlippageBps !== undefined && (
                <span>Max Slippage: {(o.maxSlippageBps / 100).toFixed(2)}%</span>
              )}
            </div>

            {type === "received" && (
              <>
                {/* Only show execute button if user is NOT the seller (account 0) */}
                {accountIndex !== 0 && (
                  <>
                    <button
                      className="btn btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={async () => {
                        setFetchingDetailsId(o.orderId);
                        try {
                          await fillOrder(o);
                        } finally {
                          setFetchingDetailsId(null);
                        }
                      }}
                      disabled={fetchingDetailsId === o.orderId}
                    >
                      {fetchingDetailsId === o.orderId ? "Fetching..." : "Fetch fill details"}
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
                        `/api/fill/stream?orderId=${o.orderId}&accountIndex=${accountIndex || 1}`,
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

                          // Update action message to show progress (hide done: messages)
                          if (message && !message.startsWith("done:")) {
                            setActionMsg(message.slice(0, 150));
                          }

                          // Check for exit code (don't display done: messages)
                          if (message.startsWith("done:")) {
                            const code = message.match(/done: (\d+)/)?.[1];
                            exitCode = code ? parseInt(code) : null;
                            // Clear the action message when done
                            setActionMsg(null);
                          }

                          // Success indicators
                          if (message.includes("Order closed in OTC order service") ||
                              message.includes("Closed order")) {
                            hasSuccess = true;
                          }

                          // Error indicators
                          if (message.includes("[err]") ||
                              message.includes("Insufficient balance") ||
                              message.includes("Error closing order") ||
                              (message.includes("Error") && !message.includes("CREATE ERROR"))) {
                            hasError = true;
                          }
                        }
                      }

                      // Success = exit 0 AND (success message OR no errors) AND no balance issues
                      const hasBalanceIssue = lastMessage.includes("Insufficient balance") ||
                                             lastMessage.includes("insufficient balance") ||
                                             lastMessage.includes("balance too low");
                      const isSuccess = exitCode === 0 && (hasSuccess || !hasError) && !hasBalanceIssue;

                      if (isSuccess) {
                        await fetchOrders();
                        setBalanceRefreshing(true);
                        setPortfolioKey(prev => prev + 1); // Force portfolio refresh
                        // Clear action message on success - don't show "done:" messages
                        setTimeout(() => setActionMsg(null), 100);
                        toast.success("Order filled successfully!");

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

                        // Refresh balances after 2s
                        setTimeout(() => setBalanceRefreshing(false), 2000);
                      } else {
                        // Filter out "done:" messages from error display
                        const cleanMessage = lastMessage.startsWith("done:") ? "" : lastMessage;
                        const errorMsg = lastMessage.includes("Insufficient balance")
                          ? "Insufficient balance to fill order"
                          : hasError && cleanMessage
                          ? cleanMessage.substring(0, 150)
                          : exitCode !== 0
                          ? `Fill failed - please check your balance and try again`
                          : "Fill operation failed";
                        setActionMsg(errorMsg);
                        toast.error(errorMsg);
                        await fetchOrders();
                      }
                    } catch (e) {
                      setActionMsg(`Execute error: ${(e as Error).message}`);
                      toast.error((e as Error).message);
                      // Ensure we clean up on error
                      await fetchOrders();
                    } finally {
                      setExecutingId(null);
                      setBalanceRefreshing(false);
                    }
                  }}
                  disabled={executingId === o.orderId}
                >
                  {executingId === o.orderId
                    ? "Executing..."
                    : "Execute Local Fill"}
                </button>
                  </>
                )}
                {accountIndex === 0 && (
                  <div style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "#2a2a2a",
                    borderRadius: 6,
                    fontSize: 13,
                    color: "#9aa3ad"
                  }}>
                    <Info size={14} style={{ display: "inline", marginRight: 4 }} /> This is your order - switch to buyer account to execute
                  </div>
                )}
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

                  setCancellingId(o.orderId);
                  try {
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
                  } finally {
                    setCancellingId(null);
                  }
                }, { errorMessage: "Failed to cancel order", showToast: true })}
                disabled={cancellingId === o.orderId}
              >
                {cancellingId === o.orderId ? "Cancelling..." : "Cancel"}
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
    // Check wallet connection first
    if (!address || accountIndex === null) {
      toast.error("Please connect your wallet to create orders");
      return;
    }

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
        ...(orderParams.minFill && { minFillAmount: orderParams.minFill }),
        // Include wallet info
        walletAddress: address,
        accountIndex: accountIndex
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

      // Refresh orders list and trigger balance refresh
      await fetchOrders();
      setBalanceRefreshing(true);
      setPortfolioKey(prev => prev + 1); // Force portfolio refresh
      setTimeout(() => setBalanceRefreshing(false), 3000);

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
            <Coins size={16} /> Portfolio
          </button>
          <WalletConnect />
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

          {/* Auto-calculation info - prices update automatically */}
          {orderParams.sellToken && orderParams.buyToken && orderParams.sellAmount && (
            <div style={{
              marginBottom: 16,
              padding: "8px 12px",
              background: "#1a1a2e",
              borderRadius: 6,
              border: "1px solid #2a2a3e",
              fontSize: 11,
              color: "#9aa3ad",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <span style={{ color: "#10b981" }}>●</span>
              <span>Prices auto-update every 10s</span>
              <button
                className="btn btn-sm"
                onClick={() => calculateMarketPrice("sell")}
                style={{ marginLeft: "auto", fontSize: 10, padding: "4px 8px" }}
              >
                <RefreshCw size={12} style={{ marginRight: 4 }} /> Refresh Now
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
            {!isConnected ? (
              <div style={{
                padding: "12px",
                background: "#0f172a",
                borderRadius: 8,
                border: "1px solid #1e293b",
                textAlign: "center"
              }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                  <Plug size={14} style={{ marginRight: 4 }} /> Wallet Required
                </div>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  Connect your wallet above to create orders
                </div>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={createOrder}
                disabled={creatingOrder}
                style={{ width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 600 }}
              >
                {creatingOrder ? "Creating..." : "Create Order"}
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-sm"
              onClick={fetchOrders}
              disabled={loading}
              style={{ flex: 1, fontSize: 10, padding: "4px 8px" }}
            >
              {loading ? "..." : <RefreshCw size={14} />}
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
              <Trash2 size={14} />
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
            {activeTab !== "history" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>Advanced Filters</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  {/* Status Filter */}
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Status</label>
                    <select
                      className="input"
                      style={{ width: "100%", fontSize: 12 }}
                      value={filters.status}
                      onChange={(e) => {
                        setFilters({ ...filters, status: e.target.value, page: 0 });
                        fetchOrders();
                      }}
                    >
                      <option value="">All Statuses</option>
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="filled">Filled</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>

                  {/* Sell Token Filter */}
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Sell Token</label>
                    <select
                      className="input"
                      style={{ width: "100%", fontSize: 12 }}
                      value={filters.sellToken || ""}
                      onChange={(e) => {
                        setFilters({ ...filters, sellToken: e.target.value || undefined, page: 0 });
                        fetchOrders();
                      }}
                    >
                      <option value="">All Tokens</option>
                      {tokenOptions.map(t => (
                        <option key={t.address} value={t.address}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Buy Token Filter */}
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Buy Token</label>
                    <select
                      className="input"
                      style={{ width: "100%", fontSize: 12 }}
                      value={filters.buyToken || ""}
                      onChange={(e) => {
                        setFilters({ ...filters, buyToken: e.target.value || undefined, page: 0 });
                        fetchOrders();
                      }}
                    >
                      <option value="">All Tokens</option>
                      {tokenOptions.map(t => (
                        <option key={t.address} value={t.address}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Search Input */}
                  <div>
                    <label style={{ fontSize: 11, opacity: 0.6, display: "block", marginBottom: 4 }}>Search</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Order ID or Escrow..."
                      style={{ width: "100%", fontSize: 12 }}
                      value={filters.search || ""}
                      onChange={(e) => {
                        setFilters({ ...filters, search: e.target.value || undefined, page: 0 });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          fetchOrders();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Clear Filters Button */}
                {(filters.status || filters.sellToken || filters.buyToken || filters.search) && (
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 12, fontSize: 11 }}
                    onClick={() => {
                      setFilters({ status: "", page: 0, limit: 10 });
                      fetchOrders();
                    }}
                  >
                    <RefreshCw size={12} style={{ marginRight: 4 }} /> Clear All Filters
                  </button>
                )}
              </div>
            )}
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
        key={portfolioKey}
        isOpen={showPortfolio}
        onClose={() => setShowPortfolio(false)}
        onRefresh={() => {
          setBalanceRefreshing(true);
          setTimeout(() => setBalanceRefreshing(false), 2000);
        }}
        refreshing={balanceRefreshing}
        connectedAddress={address}
      />
    </main>
  );
}
