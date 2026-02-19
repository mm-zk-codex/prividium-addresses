import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';
import { aliasKeyFromParts, parseEmailAndSuffix } from '@prividium-poc/types';
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
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  const login = async () => {
    if (!prividium.isAuthorized()) await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    const user = await prividium.fetchUser();
    setWalletAddress(user.wallets[0].walletAddress);
  };

  const registerAlias = async () => {
    await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix, recipientPrividiumAddress: walletAddress })
    });
  };

  const loadDeposits = async () => {
    const parsed = parseEmailAndSuffix(email, suffix);
    const aliasKey = aliasKeyFromParts(parsed.normalizedEmail, parsed.suffix);
    const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
    setRows(await resp.json());
  };

  return (
    <div className="card">
      <h1 className="text-xl font-bold">Prividium Recipient Portal</h1>
      <p className="text-sm text-sky-300">Funds land in one-way vault X that can only forward to your wallet.</p>
      <button onClick={login}>Login with Prividium</button>
      <div className="break-all text-sm">Your wallet address: {walletAddress || 'Not connected'}</div>
      <input placeholder="Session email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={registerAlias}>Register alias</button>
        <button onClick={loadDeposits}>Refresh deposit flow status</button>
      </div>
      <ul className="text-xs space-y-1">
        {rows.map((r) => (
          <li key={r.trackingId} className="border border-slate-700 rounded p-2">
            <div>{r.trackingId}</div>
            <div>{r.status}</div>
            <div className="break-all">Y (L1 deposit): {r.l1DepositAddressY}</div>
            <div className="break-all">X (L2 vault): {r.l2VaultAddressX}</div>
            <div className="break-all">L1 bridge tx: {r.l1BridgeTxHash ?? '-'}</div>
            <div className="break-all">L2 sweep tx: {r.l2SweepTxHash ?? '-'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
