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
  const apiUrl = process.env.NEXT_PUBLIC_OTC_API_URL || "http://localhost:3000";

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/order`);
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

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
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
          <li key={o.orderId} style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Escrow: {o.escrowAddress}</div>
            <div>Sell: {o.sellTokenAmount} @ {o.sellTokenAddress}</div>
            <div>Buy: {o.buyTokenAmount} @ {o.buyTokenAddress}</div>
            <button
              style={{ marginTop: 8 }}
              onClick={() => alert("Use CLI to fill for now. Next step: connect PXE + fill.")}
            >
              Fill (local)
            </button>
          </li>
        ))}
      </ul>
      {!loading && orders.length === 0 && <p>No open orders.</p>}
    </main>
  );
}


