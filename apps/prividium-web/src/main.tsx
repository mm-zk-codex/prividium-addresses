import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';
import { aliasKeyFromParts, parseEmailAndSuffix } from '@prividium-poc/types';
import './index.css';

class AuthorizedRpcClient {
  constructor(private rpcUrl: string, private headersFn: () => Promise<Record<string, string>>) {}
  async request(method: string, params: unknown[]) {
    const headers = await this.headersFn();
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
    });
    return res.json();
  }
}

const chain = defineChain({
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_PRIVIDIUM_RPC_URL ?? ''] } }
});

const prividium = createPrividiumChain({
  clientId: import.meta.env.VITE_PRIVIDIUM_CLIENT_ID,
  chain,
  rpcUrl: import.meta.env.VITE_PRIVIDIUM_RPC_URL,
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

  const rpc = useMemo(
    () =>
      new AuthorizedRpcClient(import.meta.env.VITE_PRIVIDIUM_RPC_URL, async () => {
        const headers = await prividium.getAuthHeaders();
        return headers as Record<string, string>;
      }),
    []
  );

  const login = async () => {
    if (!prividium.isAuthorized()) await prividium.authorize({ scopes: ['wallet:required', 'network:required'] });
    const accountsResp = await rpc.request('eth_accounts', []);
    const addr = accountsResp.result?.[0] ?? '';
    setWalletAddress(addr);
  };

  const registerAlias = async () => {
    const resp = await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix, recipientPrividiumAddress: walletAddress })
    });
    await resp.json();
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
            <div className="break-all">deposit: {r.depositAddress}</div>
            <div className="break-all">deployTx: {r.deployTxHash ?? '-'}</div>
            <div className="break-all">sweepTx: {r.sweepTxHash ?? '-'}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
