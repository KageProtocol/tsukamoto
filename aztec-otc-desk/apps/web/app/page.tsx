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
  const apiUrl = "/api/orders"; // use internal proxy to avoid CORS

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl);
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
      console.log("/api/fill response", json.data);
    } catch (e) {
      setActionMsg(`Fill error: ${(e as Error).message}`);
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
          </li>
        ))}
      </ul>
      {actionMsg && <p style={{ marginTop: 12 }}>{actionMsg}</p>}
      {!loading && orders.length === 0 && <p>No open orders.</p>}
    </main>
  );
}
