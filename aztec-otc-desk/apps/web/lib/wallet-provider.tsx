"use client";

import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { AccountWallet, PXE } from "@aztec/aztec.js";

// Suppress MetaMask extension errors (cosmetic only - doesn't affect Aztec wallet)
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    // Filter out MetaMask-related errors
    if (args[0]?.toString().includes('MetaMask') ||
        args[0]?.toString().includes('ethereum')) {
      return;
    }
    originalError.apply(console, args);
  };
}

// Wallet context type
type WalletContextType = {
  wallet: AccountWallet | null;
  address: string | null;
  accountIndex: number | null;
  isConnected: boolean;
  connect: (accountIndex: number) => Promise<void>;
  disconnect: () => void;
  loading: boolean;
};

// Create context
const WalletContext = createContext<WalletContextType | null>(null);

// Provider component
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<AccountWallet | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [accountIndex, setAccountIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const connect = async (index: number) => {
    setLoading(true);
    try {
      // Import dynamically to avoid server-side execution
      const { createPXEClient } = await import("@aztec/aztec.js");
      const { getInitialTestAccountsManagers } = await import("@aztec/accounts/testing");

      const pxeUrl = process.env.NEXT_PUBLIC_L2_NODE_URL || "http://localhost:8080";
      const pxe = createPXEClient(pxeUrl);

      const accountManagers = await getInitialTestAccountsManagers(pxe);
      const accountManager = accountManagers[index];

      if (!accountManager) {
        throw new Error(`Account ${index} not found`);
      }

      const newWallet = await accountManager.register();
      const walletAddress = newWallet.getAddress().toString();

      setWallet(newWallet);
      setAddress(walletAddress);
      setAccountIndex(index);

      // Store in localStorage
      localStorage.setItem("aztec_wallet_connected", "true");
      localStorage.setItem("aztec_wallet_account_index", String(index));
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    setWallet(null);
    setAddress(null);
    setAccountIndex(null);
    localStorage.removeItem("aztec_wallet_connected");
    localStorage.removeItem("aztec_wallet_account_index");
  };

  // Auto-reconnect on mount
  useEffect(() => {
    const connected = localStorage.getItem("aztec_wallet_connected");
    const storedAccountIndex = localStorage.getItem("aztec_wallet_account_index");

    if (connected === "true" && storedAccountIndex && !wallet) {
      connect(parseInt(storedAccountIndex)).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletContextType = {
    wallet,
    address,
    accountIndex,
    isConnected: !!wallet && !!address,
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
