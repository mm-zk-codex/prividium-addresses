import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';
import { aliasKeyFromParts, normalizeEmail } from '@prividium-poc/types';
import './index.css';

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

function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const [suffix, setSuffix] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  const refreshUser = async () => {
    if (!prividium.isAuthorized()) return;
    const user = await prividium.fetchUser();
    setWalletAddress(user.wallets?.[0]?.walletAddress ?? '');
    setDisplayName(user.displayName ?? '');
  };

  const login = async () => {
    await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    await refreshUser();
  };

  useEffect(() => {
    void refreshUser();
    const i = setInterval(() => void refreshUser(), 5000);
    return () => clearInterval(i);
  }, []);

  const registerAlias = async () => {
    const headers = { 'content-type': 'application/json', ...(prividium.getAuthHeaders() ?? {}) } as Record<string, string>;
    await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ suffix, recipientPrividiumAddress: walletAddress })
    });
  };

  const loadDeposits = async () => {
    const aliasKey = aliasKeyFromParts(normalizeEmail(displayName), suffix.trim().toLowerCase());
    const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
    setRows(await resp.json());
  };

  const retryEvent = async (eventId: number) => {
    const headers = { 'content-type': 'application/json', ...(prividium.getAuthHeaders() ?? {}) } as Record<string, string>;
    await fetch(`${resolver}/deposit-events/${eventId}/retry`, { method: 'POST', headers, body: JSON.stringify({ suffix }) });
    await loadDeposits();
  };

  const retryAllStuck = async () => {
    const stuck = rows.flatMap((r) => (r.events ?? []).filter((e: any) => e.stuck));
    for (const event of stuck) await retryEvent(event.id);
  };

  return (
    <div className="card">
      <h1 className="text-xl font-bold">Prividium Recipient Portal</h1>
      <button onClick={login}>Login with Prividium</button>
      <div className="text-sm">Signed in as: {displayName || 'Not connected'}</div>
      <div className="break-all text-sm">Your wallet address: {walletAddress || 'Not connected'}</div>
      <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={registerAlias}>Register alias</button>
        <button onClick={loadDeposits}>Refresh deposit flow status</button>
        <button onClick={retryAllStuck}>Retry all stuck</button>
      </div>
      <ul className="text-xs space-y-1">
        {rows.map((r) => (
          <li key={r.trackingId} className="border border-slate-700 rounded p-2">
            <div>{r.trackingId}</div>
            <div className="break-all">Y: {r.l1DepositAddressY}</div>
            <div className="break-all">X: {r.l2VaultAddressX}</div>
            {(r.events ?? []).map((e: any) => (
              <div key={e.id} className={e.stuck ? 'bg-red-900/40 p-1 rounded mt-1' : 'mt-1'}>
                <div>{e.kind} {e.amount} - {e.status}</div>
                {e.stuck ? <div>stuck after {e.attempts} attempts; error: {e.error}</div> : null}
                {e.stuck ? <button onClick={() => retryEvent(e.id)}>Retry</button> : null}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
