import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Address, Transport } from 'viem';
import { prividium } from '../app/prividium';

type AuthContextValue = {
  isAuthenticated: boolean;
  displayName: string;
  walletAddress: string;
  walletAddresses: string[];
  authHeaders: Record<string, string>;
  transport: Transport;
  authorizeTransaction: (params: {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    value: bigint;
  }) => Promise<void>;
  addNetworkToWallet: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function PrividiumAuthProvider({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);

  const clear = () => {
    setDisplayName('');
    setWalletAddress('');
    setWalletAddresses([]);
  };

  const refresh = async () => {
    if (!prividium.isAuthorized()) {
      clear();
      return;
    }
    try {
      const user = await prividium.fetchUser();
      const nextWalletAddresses = (user.wallets ?? [])
        .map((wallet: any) => wallet?.walletAddress ?? '')
        .filter((wallet: string): wallet is string => Boolean(wallet));
      setWalletAddresses(nextWalletAddresses);
      setWalletAddress(nextWalletAddresses[0] ?? '');
      setDisplayName(user.displayName ?? '');
    } catch {
      clear();
    }
  };

  const login = async () => {
    await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    await refresh();
  };

  const logout = async () => {
    clear();
    prividium.unauthorize();
  };

  useEffect(() => {
    void refresh();
    const i = setInterval(() => void refresh(), 5000);
    return () => clearInterval(i);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: Boolean(displayName && walletAddress),
      displayName,
      walletAddress,
      walletAddresses,
      authHeaders: (prividium.getAuthHeaders() ?? {}) as Record<string, string>,
      transport: prividium.transport,
      authorizeTransaction: async (params) => {
        await prividium.authorizeTransaction(params);
      },
      addNetworkToWallet: async () => {
        await prividium.addNetworkToWallet();
      },
      login,
      logout,
      refresh
    }),
    [displayName, walletAddress, walletAddresses]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePrividiumAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePrividiumAuth must be used inside provider');
  return ctx;
}
