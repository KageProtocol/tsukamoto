"use client";

type OrderStatus = "open" | "filled" | "cancelled" | "expired" | "partial" | "pending";

type OrderStatusBadgeProps = {
  status: OrderStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
};

export default function OrderStatusBadge({
  status,
  size = "md",
  showIcon = true
}: OrderStatusBadgeProps) {
  const getStatusConfig = (status: OrderStatus) => {
    const configs = {
      open: {
        color: "#3b82f6",
        background: "#3b82f620",
        icon: "🟢",
        label: "Open"
      },
      filled: {
        color: "#10b981",
        background: "#10b98120",
        icon: "✅",
        label: "Filled"
      },
      cancelled: {
        color: "#ef4444",
        background: "#ef444420",
        icon: "❌",
        label: "Cancelled"
      },
      expired: {
        color: "#f59e0b",
        background: "#f59e0b20",
        icon: "⏰",
        label: "Expired"
      },
      partial: {
        color: "#8b5cf6",
        background: "#8b5cf620",
        icon: "🔄",
        label: "Partially Filled"
      },
      pending: {
        color: "#6b7280",
        background: "#6b728020",
        icon: "⏳",
        label: "Pending"
      }
    };
    return configs[status] || configs.open;
  };

  const getSizeStyles = (size: string) => {
    const sizes = {
      sm: {
        fontSize: 10,
        padding: "2px 6px",
        iconSize: 10
      },
      md: {
        fontSize: 11,
        padding: "4px 8px",
        iconSize: 12
      },
      lg: {
        fontSize: 12,
        padding: "6px 10px",
        iconSize: 14
      }
    };
    return sizes[size] || sizes.md;
  };

  const config = getStatusConfig(status);
  const sizeStyles = getSizeStyles(size);

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: showIcon ? 4 : 0,
      padding: sizeStyles.padding,
      borderRadius: 4,
      background: config.background,
      color: config.color,
      fontSize: sizeStyles.fontSize,
      fontWeight: 600,
      textTransform: "uppercase",
      border: `1px solid ${config.color}40`,
    }}>
      {showIcon && (
        <span style={{ fontSize: sizeStyles.iconSize }}>
          {config.icon}
        </span>
      )}
      {config.label}
    </span>
  );
}

// Helper function to determine order status
export function getOrderStatus(order: any): OrderStatus {
  if (order.status) {
    return order.status.toLowerCase();
  }

  // Check if order is expired
  if (order.expiresAt && order.expiresAt < Date.now()) {
    return "expired";
  }

  // Default to open if no status specified
  return "open";
}

// Enhanced order status with additional context
export function OrderStatusWithContext({
  order,
  size = "md"
}: {
  order: any;
  size?: "sm" | "md" | "lg"
}) {
  const status = getOrderStatus(order);
  const isExpiringSoon = order.expiresAt &&
    order.expiresAt > Date.now() &&
    order.expiresAt < Date.now() + (24 * 60 * 60 * 1000); // 24 hours

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <OrderStatusBadge status={status} size={size} />

      {isExpiringSoon && status === "open" && (
        <span style={{
          fontSize: 10,
          color: "#f59e0b",
          display: "flex",
          alignItems: "center",
          gap: 2
        }}>
          ⚡ Expires soon
        </span>
      )}

      {order.createdAt && (
        <span style={{
          fontSize: 10,
          color: "#6b7280"
        }}>
          {new Date(order.createdAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
          })}
        </span>
      )}
    </div>
  );
}