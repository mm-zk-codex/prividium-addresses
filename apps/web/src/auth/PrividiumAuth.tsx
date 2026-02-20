import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';

type AuthContextValue = {
  isAuthenticated: boolean;
  displayName: string;
  walletAddress: string;
  authHeaders: Record<string, string>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const chain = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL ?? ''] } }
});

const prividium = createPrividiumChain({
  clientId: import.meta.env.VITE_PRIVIDIUM_CLIENT_ID!,
  chain,
  authBaseUrl: import.meta.env.VITE_PRIVIDIUM_AUTH_BASE_URL!,
  prividiumApiBaseUrl: import.meta.env.VITE_PRIVIDIUM_API_BASE_URL!,
  redirectUrl: `${window.location.origin}/auth/callback.html`
});

const AuthContext = createContext<AuthContextValue | null>(null);

export function PrividiumAuthProvider({ children }: { children: React.ReactNode }) {
  const [displayName, setDisplayName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  const clear = () => {
    setDisplayName('');
    setWalletAddress('');
  };

  const refresh = async () => {
    if (!prividium.isAuthorized()) {
      clear();
      return;
    }
    try {
      const user = await prividium.fetchUser();
      setWalletAddress((user.wallets?.[0] as any)?.walletAddress ?? '');
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
      authHeaders: (prividium.getAuthHeaders() ?? {}) as Record<string, string>,
      login,
      logout,
      refresh
    }),
    [displayName, walletAddress]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePrividiumAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePrividiumAuth must be used inside provider');
  return ctx;
}
