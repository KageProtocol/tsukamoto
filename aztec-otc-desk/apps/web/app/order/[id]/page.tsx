import "server-only";

async function getOrder(id: string) {
  const api = process.env.NEXT_PUBLIC_OTC_API_URL || "http://localhost:3000";
  const res = await fetch(`${api}/order?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!json.success || !json.data?.length) return null;
  return json.data[0];
}

export default async function OrderPage({
  params,
}: {
  params: { id: string };
}) {
  const order = await getOrder(params.id);
  if (!order) {
    return (
      <main style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
        <h1>Order not found</h1>
      </main>
    );
  }
  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <h1>Order #{order.orderId}</h1>
      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        Status: {order.status || "open"}
        {order.createdAt
          ? ` · Created: ${new Date(order.createdAt).toLocaleString()}`
          : ""}
        {order.expiresAt
          ? ` · Expires: ${new Date(order.expiresAt * 1000).toLocaleString()}`
          : ""}
      </div>
      <pre
        style={{
          background: "#121212",
          border: "1px solid #1e1e1e",
          borderRadius: 8,
          padding: 16,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(order, null, 2)}
      </pre>
    </main>
  );
}
