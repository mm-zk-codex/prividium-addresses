import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';
const chain = defineChain({
    id: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL ?? ''] } }
});
const prividium = createPrividiumChain({
    clientId: import.meta.env.VITE_PRIVIDIUM_CLIENT_ID,
    chain,
    authBaseUrl: import.meta.env.VITE_PRIVIDIUM_AUTH_BASE_URL,
    prividiumApiBaseUrl: import.meta.env.VITE_PRIVIDIUM_API_BASE_URL,
    redirectUrl: `${window.location.origin}/auth/callback.html`
});
const AuthContext = createContext(null);
export function PrividiumAuthProvider({ children }) {
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
            setWalletAddress(user.wallets?.[0]?.walletAddress ?? '');
            setDisplayName(user.displayName ?? '');
        }
        catch {
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
    const value = useMemo(() => ({
        isAuthenticated: Boolean(displayName && walletAddress),
        displayName,
        walletAddress,
        authHeaders: (prividium.getAuthHeaders() ?? {}),
        login,
        logout,
        refresh
    }), [displayName, walletAddress]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function usePrividiumAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('usePrividiumAuth must be used inside provider');
    return ctx;
}
