"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";

// Wallet context type (simplified - no actual wallet connection in browser)
type WalletContextType = {
  wallet: null;
  address: string | null;
  accountIndex: number | null;
  isConnected: boolean;
  connect: (accountIndex: number, accountName?: string) => Promise<void>;
  disconnect: () => void;
  loading: boolean;
};

// Create context
const WalletContext = createContext<WalletContextType | null>(null);

// Mock account addresses for sandbox (these are deterministic test accounts)
const SANDBOX_ACCOUNT_ADDRESSES = [
  "0x25048e8c...1234", // Account 0 (Seller)
  "0x2e4f852b...5678", // Account 1 (Buyer)
  "0x1a3c9d7e...9abc", // Account 2 (Test)
];

// Provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet] = useState<null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [accountIndex, setAccountIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const connect = async (index: number, accountName?: string) => {
    setLoading(true);
    try {
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use mock address for now (actual wallet operations happen server-side)
      const mockAddress = SANDBOX_ACCOUNT_ADDRESSES[index] || `0x${index}...test`;

      setAddress(mockAddress);
      setAccountIndex(index);

      // Store in localStorage
      localStorage.setItem("aztec_wallet_connected", "true");
      localStorage.setItem("aztec_wallet_account_index", String(index));
      localStorage.setItem("aztec_wallet_account_name", accountName || `Account ${index}`);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      // Clear localStorage on error
      localStorage.removeItem("aztec_wallet_connected");
      localStorage.removeItem("aztec_wallet_account_index");
      localStorage.removeItem("aztec_wallet_account_name");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setAccountIndex(null);
    localStorage.removeItem("aztec_wallet_connected");
    localStorage.removeItem("aztec_wallet_account_index");
    localStorage.removeItem("aztec_wallet_account_name");
  };

  // Auto-reconnect on mount
  useEffect(() => {
    const connected = localStorage.getItem("aztec_wallet_connected");
    const storedAccountIndex = localStorage.getItem("aztec_wallet_account_index");
    const storedAccountName = localStorage.getItem("aztec_wallet_account_name");

    if (connected === "true" && storedAccountIndex) {
      const index = parseInt(storedAccountIndex);
      const mockAddress = SANDBOX_ACCOUNT_ADDRESSES[index] || `0x${index}...test`;
      setAddress(mockAddress);
      setAccountIndex(index);
      console.log(`[Wallet] Reconnected to ${storedAccountName || `Account ${index}`}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletContextType = {
    wallet: null,
    address,
    accountIndex,
    isConnected: !!address && accountIndex !== null,
    connect,
    disconnect,
    loading,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Hook to use wallet
export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return context;
}
