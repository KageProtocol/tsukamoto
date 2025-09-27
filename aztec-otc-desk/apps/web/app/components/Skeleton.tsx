export function OrderSkeleton() {
  return (
    <li
      className="skeleton"
      style={{
        border: "1px solid #1e1e1e",
        borderRadius: 8,
        padding: 16,
        marginTop: 12,
        background: "#121212",
        height: 120,
      }}
    />
  );
}

export function ChartSkeleton() {
  return (
    <div className="card chart skeleton" style={{ height: 360 }}>
      <div className="chart-empty">Loading chart data...</div>
    </div>
  );
}

export function OrderListSkeleton() {
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {Array.from({ length: 3 }, (_, i) => (
        <OrderSkeleton key={i} />
      ))}
    </ul>
  );
}