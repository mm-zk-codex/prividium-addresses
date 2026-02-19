import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

type DepositResp = { trackingId: string; depositAddress: string; chainId: number; factory: string; adapter: string };

action();
function action() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';

  function App() {
    const [email, setEmail] = useState('');
    const [suffix, setSuffix] = useState('');
    const [req, setReq] = useState<DepositResp | null>(null);
    const [status, setStatus] = useState<any>(null);

    const generate = async () => {
      const r = await fetch(`${resolver}/deposit/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, suffix, chainId: 11155111 })
      });
      const data = await r.json();
      setReq(data);
      setStatus(null);
    };

    useEffect(() => {
      if (!req?.trackingId) return;
      const interval = setInterval(async () => {
        const r = await fetch(`${resolver}/deposit/${req.trackingId}`);
        const data = await r.json();
        setStatus(data);
      }, 2000);
      return () => clearInterval(interval);
    }, [req?.trackingId]);

    return (
      <div className="card">
        <h1 className="text-xl font-bold">Prividium Send (Phase 1)</h1>
        <p className="text-sm text-amber-300">Sepolia native ETH only. Deposits are forwarded to treasury in this PoC.</p>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        <button onClick={generate}>Generate deposit address</button>
        {req && (
          <div className="space-y-1 text-sm">
            <div>trackingId: {req.trackingId}</div>
            <div className="break-all">depositAddress: {req.depositAddress}</div>
            <button onClick={() => navigator.clipboard.writeText(req.depositAddress)}>Copy deposit address</button>
            <div>status: {status?.status ?? 'issued'}</div>
          </div>
        )}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
}
