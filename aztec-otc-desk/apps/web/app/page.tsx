"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTokenAmount } from "../lib/tokens";
import Chart from "./components/Chart";

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
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
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
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ type: "success", msg: "Copied" });
      setTimeout(() => setToast(null), 1500);
    } catch {}
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

  useEffect(() => {
    fetchOrders();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
      setToast({ type: "success", msg: "Fetched include_sensitive details" });
      console.log("/api/fill response", json.data);
    } catch (e) {
      setActionMsg(`Fill error: ${(e as Error).message}`);
      setToast({ type: "error", msg: (e as Error).message });
    }
  };

  // Token registry dropdown helpers
  const ETH_ADDR = process.env.NEXT_PUBLIC_ETH_ADDRESS || "";
  const USDC_ADDR = process.env.NEXT_PUBLIC_USDC_ADDRESS || "";
  const tokenOptions = [
    { label: "ETH", address: ETH_ADDR, ticker: "ETH-USD", decimals: 18 },
    { label: "USDC", address: USDC_ADDR, ticker: "USDC-USD", decimals: 6 },
  ];
  const findToken = (addr: string) =>
    tokenOptions.find((t) => t.address?.toLowerCase() === addr?.toLowerCase());

  async function loadUsdHint(addr: string, setFn: (v: number | null) => void) {
    const token = findToken(addr);
    if (!token) {
      setFn(null);
      return;
    }
    const res = await fetch(
      `/api/chart?ticker=${encodeURIComponent(token.ticker)}&interval=day&interval_multiplier=1`,
    );
    const json = await res.json();
    const last =
      Array.isArray(json?.data) && json.data.length
        ? json.data[json.data.length - 1]
        : null;
    setFn(last ? Number(last.close) : null);
  }

  return (
    <main className="container">
      <div className="header">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand">Tsukamoto OTC</div>
          <span className="brand-badge">Aztec Private</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
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
          onClick={async () => {
            setActionMsg(null);
            const res = await fetch("/api/order/cancel-all", {
              method: "POST",
            });
            const json = await res.json();
            if (!json.success) {
              setToast({
                type: "error",
                msg: json.error || "Cancel all failed",
              });
            } else {
              setToast({
                type: "success",
                msg: `Cancelled ${json.count ?? "open"} orders`,
              });
              await fetchOrders();
            }
          }}
          style={{ marginLeft: "auto" }}
        >
          Cancel All
        </button>
      </div>
      <div className="grid section">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="pill">OTC</div>
            <div className="toolbar">
              <span className="pill">Ethereum</span>
            </div>
          </div>
          <div className="section" style={{ fontSize: 12, color: "#9aa3ad" }}>
            Send
          </div>
          <div className="row section">
            <select
              className="input"
              value={filters.sell}
              onChange={(e) => {
                setFilters({ ...filters, sell: e.target.value });
                void loadUsdHint(e.target.value, setSellUsd);
              }}
            >
              <option value="">Custom address…</option>
              {tokenOptions.map((t) => (
                <option key={t.label} value={t.address}>
                  {t.label} ({t.address?.slice(0, 6)}…{t.address?.slice(-4)})
                </option>
              ))}
            </select>
          </div>
          <div className="row section">
            <input
              className="input"
              placeholder="Or paste sell token address"
              value={filters.sell}
              onChange={(e) => setFilters({ ...filters, sell: e.target.value })}
            />
          </div>
          <div className="row section">
            <input
              className="input"
              placeholder="Sell amount"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
            />
            <span
              className="pill"
              style={{ minWidth: 120, textAlign: "center" }}
            >
              {sellUsd && sellAmount
                ? `~ $${(
                    Number(sellAmount || 0) * Number(sellUsd || 0)
                  ).toLocaleString()}`
                : "~ $0.00"}
            </span>
          </div>
          <div className="section" style={{ fontSize: 12, color: "#9aa3ad" }}>
            Receive
          </div>
          <div className="row section">
            <select
              className="input"
              value={filters.buy}
              onChange={(e) => {
                setFilters({ ...filters, buy: e.target.value });
                void loadUsdHint(e.target.value, setBuyUsd);
              }}
            >
              <option value="">Custom address…</option>
              {tokenOptions.map((t) => (
                <option key={t.label} value={t.address}>
                  {t.label} ({t.address?.slice(0, 6)}…{t.address?.slice(-4)})
                </option>
              ))}
            </select>
          </div>
          <div className="row section">
            <input
              className="input"
              placeholder="Or paste buy token address"
              value={filters.buy}
              onChange={(e) => setFilters({ ...filters, buy: e.target.value })}
            />
          </div>
          <div className="row section">
            <input
              className="input"
              placeholder="Buy amount"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
            />
            <span
              className="pill"
              style={{ minWidth: 120, textAlign: "center" }}
            >
              {buyUsd && buyAmount
                ? `~ $${(
                    Number(buyAmount || 0) * Number(buyUsd || 0)
                  ).toLocaleString()}`
                : "~ $0.00"}
            </span>
          </div>
          <div className="row section">
            <button className="btn" onClick={fetchOrders}>
              Apply Filters
            </button>
            <div className="spacer" />
            <button
              className="btn btn-primary"
              onClick={async () => {
                setActionMsg(null);
                setToast(null);
                setCreating(true);
                const res = await fetch("/api/order/create", {
                  method: "POST",
                });
                const json = await res.json();
                if (!json.success) {
                  setActionMsg(`Create order error: ${json.error}`);
                  setToast({
                    type: "error",
                    msg: json.error || "Create failed",
                  });
                } else {
                  setActionMsg("Created order via CLI. Refreshing...");
                  setToast({ type: "success", msg: "Order created" });
                  await fetchOrders();
                }
                setCreating(false);
              }}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Order"}
            </button>
          </div>
        </div>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <select
              className="input"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              style={{ width: 180 }}
            >
              <option value="ETH-USD">ETH-USD</option>
              <option value="BTC-USD">BTC-USD</option>
              <option value="SOL-USD">SOL-USD</option>
            </select>
            <select
              className="input"
              value={interval}
              onChange={(e) => setInterval(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="minute">Minute</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
            <select
              className="input"
              value={intervalMultiplier}
              onChange={(e) => setIntervalMultiplier(Number(e.target.value))}
              style={{ width: 120 }}
            >
              <option value={1}>x1</option>
              <option value={5}>x5</option>
              <option value={15}>x15</option>
            </select>
            <select
              className="input"
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              style={{ width: 140 }}
            >
              <option value="area">Area</option>
              <option value="candles">Candles</option>
            </select>
            <button
              className="btn"
              onClick={() => {
                /* trigger Chart props change */ setTicker((t) => t);
              }}
            >
              Refresh
            </button>
          </div>
          <Chart
            ticker={ticker}
            interval={interval}
            intervalMultiplier={intervalMultiplier}
            type={chartType}
          />
          <div className="tabs">
            {(["submitted", "received", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`tab ${activeTab === t ? "active" : ""}`}
              >
                {t === "submitted"
                  ? "Submitted Orders"
                  : t === "received"
                    ? "Received Orders"
                    : "Order History"}
              </button>
            ))}
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
      <ul style={{ listStyle: "none", padding: 0 }}>
        {orders
          .filter((o) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return (
              o.sellTokenAddress.toLowerCase().includes(q) ||
              o.buyTokenAddress.toLowerCase().includes(q) ||
              (o as any).status?.toLowerCase?.().includes(q)
            );
          })
          .map((o) => (
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
              <div>
                Sell: {formatTokenAmount(o.sellTokenAddress, o.sellTokenAmount)}{" "}
                @ {o.sellTokenAddress}
                <span className="copy" onClick={() => copy(o.sellTokenAddress)}>
                  Copy
                </span>
              </div>
              <div>
                Buy: {formatTokenAmount(o.buyTokenAddress, o.buyTokenAmount)} @{" "}
                {o.buyTokenAddress}
                <span className="copy" onClick={() => copy(o.buyTokenAddress)}>
                  Copy
                </span>
              </div>
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                Order ID: {o.orderId}
                <span className="copy" onClick={() => copy(o.orderId)}>
                  Copy
                </span>
                {" · "}
                Status: {o.status || "open"}
                {o.createdAt ? (
                  <>
                    {" · Created: "}
                    {new Date(o.createdAt).toLocaleString()}
                  </>
                ) : null}
              </div>
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
                      const last = lines[lines.length - 1]?.replace(
                        /^data: /,
                        "",
                      );
                      if (last)
                        setToast({ type: "success", msg: last.slice(0, 120) });
                    }
                    await fetchOrders();
                    setActionMsg("Executed local fill_by_id.");
                  } catch (e) {
                    setActionMsg(`Execute error: ${(e as Error).message}`);
                    setToast({ type: "error", msg: (e as Error).message });
                  }
                  setExecutingId(null);
                }}
                disabled={executingId === o.orderId}
              >
                {executingId === o.orderId
                  ? "Executing..."
                  : "Execute Local Fill"}
              </button>
              <Link href={`/order/${o.orderId}`} style={{ float: "right" }}>
                Details →
              </Link>
              <button
                className="btn btn-sm btn-danger"
                style={{ marginLeft: 8 }}
                onClick={async () => {
                  setActionMsg(null);
                  const res = await fetch("/api/order/cancel", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ orderId: o.orderId }),
                  });
                  const json = await res.json();
                  if (!json.success) {
                    setToast({
                      type: "error",
                      msg: json.error || "Cancel failed",
                    });
                  } else {
                    setToast({ type: "success", msg: "Order cancelled" });
                    setTimeout(fetchOrders, 500);
                  }
                }}
              >
                Cancel
              </button>
            </li>
          ))}
      </ul>
      {actionMsg && <p style={{ marginTop: 12 }}>{actionMsg}</p>}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            background: toast.type === "success" ? "#0c7" : "#c22",
            color: "white",
            padding: "10px 14px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
          onClick={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
      {!loading && orders.length === 0 && <p>No open orders.</p>}
    </main>
  );
}
