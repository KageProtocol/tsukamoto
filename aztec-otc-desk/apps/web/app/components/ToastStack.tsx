"use client";
import { useState, useCallback, useEffect } from "react";

export type Toast = {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
  persistent?: boolean;
};

type ToastContextType = {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
};

let toastContext: ToastContextType | null = null;

export function ToastStack() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove non-persistent toasts
    if (!toast.persistent) {
      const duration = toast.duration || 3000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Set up global toast context
  useEffect(() => {
    toastContext = { toasts, addToast, removeToast, clearAll };
    return () => {
      toastContext = null;
    };
  }, [toasts, addToast, removeToast, clearAll]);

  const getToastStyle = (type: Toast["type"]) => {
    const baseStyle = {
      background: "#1a1a1a",
      color: "#fff",
      border: "1px solid var(--border)",
      padding: "10px 14px",
      borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      minWidth: "300px",
      maxWidth: "400px",
      cursor: "pointer",
      transform: "translateX(0)",
      transition: "all 0.3s ease",
      position: "relative" as const,
      overflow: "hidden" as const,
    };

    const typeStyles = {
      success: { borderColor: "#0c7", background: "linear-gradient(135deg, #0c7 0%, #0a5 100%)" },
      error: { borderColor: "#c22", background: "linear-gradient(135deg, #c22 0%, #a11 100%)" },
      warning: { borderColor: "#f59e0b", background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" },
      info: { borderColor: "#3b82f6", background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" },
    };

    return { ...baseStyle, ...typeStyles[type] };
  };

  const getIcon = (type: Toast["type"]) => {
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type];
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          style={{
            ...getToastStyle(toast.type),
            animation: `slideInRight 0.3s ease forwards ${index * 100}ms`,
          }}
          onClick={() => removeToast(toast.id)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", fontWeight: "bold" }}>
              {getIcon(toast.type)}
            </span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.persistent && (
              <button
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  color: "inherit",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      {toasts.length > 1 && (
        <button
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
            marginTop: "8px",
            width: "100%",
          }}
          onClick={clearAll}
        >
          Clear All ({toasts.length})
        </button>
      )}
    </div>
  );
}

// Global toast helpers
export const toast = {
  success: (message: string, options?: Partial<Toast>) =>
    toastContext?.addToast({ type: "success", message, ...options }),
  error: (message: string, options?: Partial<Toast>) =>
    toastContext?.addToast({ type: "error", message, ...options }),
  warning: (message: string, options?: Partial<Toast>) =>
    toastContext?.addToast({ type: "warning", message, ...options }),
  info: (message: string, options?: Partial<Toast>) =>
    toastContext?.addToast({ type: "info", message, ...options }),
  remove: (id: string) => toastContext?.removeToast(id),
  clearAll: () => toastContext?.clearAll(),
};

// Add CSS animation
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}