"use client";
import { useEffect, useState } from "react";

type Order = {
  orderId: string;
  escrowAddress: string;
  contractInstance: string;
  sellTokenAddress: string;
  sellTokenAmount: string;
  buyTokenAddress: string;
  buyTokenAmount: string;
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
  const [filters, setFilters] = useState({
    sell: "",
    buy: "",
    page: 0,
    pageSize: 10,
  });
  const apiUrl = "/api/orders"; // use internal proxy to avoid CORS

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.sell) qs.set("sell_token_address", filters.sell);
      if (filters.buy) qs.set("buy_token_address", filters.buy);
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

  return (
    <main
      style={{
        maxWidth: 920,
        margin: "0 auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1>Private OTC Orders</h1>
      <p style={{ color: "#666" }}>
        Listing public orders from {apiUrl}. Click refresh to reload.
      </p>
      <button onClick={fetchOrders} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
      <button
        style={{ marginLeft: 8 }}
        onClick={async () => {
          setActionMsg(null);
          const res = await fetch("/api/order/create", { method: "POST" });
          const json = await res.json();
          if (!json.success) setActionMsg(`Create order error: ${json.error}`);
          else {
            setActionMsg("Created order via CLI. Refreshing...");
            await fetchOrders();
          }
        }}
      >
        Create Order
      </button>
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <input
          placeholder="Sell token address"
          value={filters.sell}
          onChange={(e) => setFilters({ ...filters, sell: e.target.value })}
          style={{ width: 360 }}
        />
        <input
          placeholder="Buy token address"
          value={filters.buy}
          onChange={(e) => setFilters({ ...filters, buy: e.target.value })}
          style={{ width: 360 }}
        />
        <button onClick={fetchOrders}>Apply Filters</button>
      </div>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {orders.map((o) => (
          <li
            key={o.orderId}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 16,
              marginTop: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Escrow: {o.escrowAddress}</div>
            <div>
              Sell: {o.sellTokenAmount} @ {o.sellTokenAddress}
            </div>
            <div>
              Buy: {o.buyTokenAmount} @ {o.buyTokenAddress}
            </div>
            <button style={{ marginTop: 8 }} onClick={() => fillOrder(o)}>
              Fetch fill details
            </button>
            <button
              style={{ marginLeft: 8 }}
              onClick={async () => {
                setActionMsg(null);
                setExecutingId(o.orderId);
                const res = await fetch("/api/fill/execute", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ orderId: o.orderId }),
                });
                const json = await res.json();
                if (!json.success) {
                  setActionMsg(`Execute error: ${json.error}`);
                  setToast({ type: "error", msg: json.error });
                } else {
                  setActionMsg("Executed local fill_by_id. Check server logs.");
                  setToast({ type: "success", msg: "Local fill executed" });
                  await fetchOrders();
                }
                setExecutingId(null);
              }}
              disabled={executingId === o.orderId}
            >
              {executingId === o.orderId
                ? "Executing..."
                : "Execute Local Fill"}
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
