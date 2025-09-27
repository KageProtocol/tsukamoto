"use client";
import { useState } from "react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: "danger" | "warning" | "info";
};

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  type = "info"
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getTypeColor = () => {
    switch (type) {
      case "danger": return "#c22121";
      case "warning": return "#f59e0b";
      default: return "#3b82f6";
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case "danger": return "⚠️";
      case "warning": return "🔔";
      default: return "ℹ️";
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="card" style={{
        width: "100%",
        maxWidth: 400,
        margin: 16,
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16
        }}>
          <div style={{ fontSize: 24 }}>{getTypeIcon()}</div>
          <h3 style={{ margin: 0, color: getTypeColor() }}>{title}</h3>
        </div>

        <p style={{
          margin: "0 0 24px 0",
          color: "#9aa3ad",
          lineHeight: 1.5
        }}>
          {message}
        </p>

        <div className="row" style={{
          justifyContent: "flex-end",
          gap: 8
        }}>
          <button
            className="btn"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={`btn ${type === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy confirmation dialogs
export function useConfirmDialog() {
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: "danger" | "warning" | "info";
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: ""
  });

  const confirm = (options: Omit<typeof dialog, "isOpen">) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        ...options,
        isOpen: true,
        onConfirm: () => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          resolve(true);
          options.onConfirm?.();
        }
      });
    });
  };

  const closeDialog = () => {
    setDialog(prev => ({ ...prev, isOpen: false }));
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      {...dialog}
      onConfirm={() => dialog.onConfirm?.()}
      onCancel={closeDialog}
    />
  );

  return { confirm, ConfirmDialogComponent };
}