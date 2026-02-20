import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [req, setReq] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);

  const generate = async () => {
    const r = await fetch(`${resolver}/deposit/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix })
    });
    const data = await r.json();
    setReq(data);
    setStatus(null);
  };

  useEffect(() => {
    if (!req?.trackingId) return;
    const it = setInterval(async () => {
      const r = await fetch(`${resolver}/deposit/${req.trackingId}`);
      setStatus(await r.json());
    }, 2500);
    return () => clearInterval(it);
  }, [req?.trackingId]);

  return (
    <div className="card">
      <h1 className="text-xl font-bold">Prividium Send</h1>
      <p className="text-sm text-emerald-300">Transfer ETH or any supported ERC20 to one deposit address.</p>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
      <button onClick={generate}>Generate deposit address</button>
      {req && (
        <div className="space-y-2 text-sm">
          <div>trackingId: {req.trackingId}</div>
          <div className="break-all">L1 deposit Y: {req.l1DepositAddress}</div>
          <button onClick={() => navigator.clipboard.writeText(req.l1DepositAddress)}>Copy deposit address</button>
          <div className="text-xs text-slate-300">Send ETH or supported ERC20. Asset is auto-detected by relayer.</div>
          <ul className="space-y-1 text-xs">
            {(status?.events ?? []).map((e: any) => (
              <li key={e.id} className="border border-slate-700 rounded p-2">
                <div>{e.kind} {e.l1TokenAddress ? `(${e.l1TokenAddress})` : ''}</div>
                <div>amount: {e.amount}</div>
                <div>status: {e.status}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
