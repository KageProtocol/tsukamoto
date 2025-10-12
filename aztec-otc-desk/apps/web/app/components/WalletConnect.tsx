"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-provider";
import { toast } from "./ToastStack";
import { Plug, MapPin, Lock, Store, User, FlaskConical, X, Loader2 } from "lucide-react";

export default function WalletConnect() {
  const { address, isConnected, connect, disconnect, loading } = useWallet();
  const [isOpen, setIsOpen] = useState(false);

  const formatAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const handleConnect = async (accountIndex: number, accountName: string) => {
    try {
      toast.info(`Connecting to ${accountName}...`);
      await connect(accountIndex);
      toast.success(`Connected to ${accountName}`);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      toast.error(`Failed to connect to ${accountName}. Please try again.`);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success("Wallet disconnected");
  };

  // Test accounts for sandbox
  const testAccounts = [
    { index: 0, name: "Seller Account", icon: <Store size={18} /> },
    { index: 1, name: "Buyer Account", icon: <User size={18} /> },
    { index: 2, name: "Test Account 3", icon: <FlaskConical size={18} /> },
  ];

  if (isConnected && address) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <div
          className="card"
          style={{
            padding: "8px 16px",
            background: "#1a1a1a",
            border: "1px solid #333",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
            }}
          />
          <span style={{ fontFamily: "monospace", fontSize: 14 }}>
            {formatAddress(address)}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        className="btn"
        onClick={() => setIsOpen(true)}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Connecting...
          </>
        ) : (
          <>
            <Plug size={16} /> Connect Wallet
          </>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 400,
              margin: 16,
            }}
          >
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <h2 style={{ margin: 0 }}>Connect Wallet</h2>
              <button className="btn btn-ghost" onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 12,
                background: "#0f172a",
                borderRadius: 8,
                border: "1px solid #1e293b",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={14} /> Sandbox Mode
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Select a test account from the Aztec sandbox to get started.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {testAccounts.map((account) => (
                <button
                  key={account.index}
                  className="btn"
                  onClick={() => handleConnect(account.index, account.name)}
                  disabled={loading}
                  style={{
                    justifyContent: "flex-start",
                    padding: "16px 20px",
                    fontSize: 16,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  <div className="row" style={{ gap: 12, alignItems: "center", width: "100%" }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#333",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                      }}
                    >
                      {account.icon}
                    </div>
                    <div style={{ textAlign: "left", flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{account.name}</div>
                      <div style={{ fontSize: 12, color: "#9aa3ad" }}>
                        Sandbox Account {account.index}
                      </div>
                    </div>
                    {loading && <Loader2 size={16} className="animate-spin" style={{ color: "#64748b" }} />}
                  </div>
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "#0f172a",
                borderRadius: 8,
                border: "1px solid #1e293b",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Lock size={14} /> Privacy First
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                Your wallet uses zero-knowledge proofs to keep all transactions
                private. Only you can see your balances and activity.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
