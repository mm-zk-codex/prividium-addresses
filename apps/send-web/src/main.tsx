import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

type DepositResp = { trackingId: string; l1DepositAddress: string; l2Destination?: string; tokenType: 'ETH' | 'ERC20' };
const timeline = ['issued', 'l1_detected', 'l1_bridging_submitted', 'l2_arrived', 'credited'];

function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [tokenType, setTokenType] = useState<'ETH' | 'ERC20'>('ETH');
  const [req, setReq] = useState<DepositResp | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const generate = async () => {
    const r = await fetch(`${resolver}/deposit/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix, tokenType })
    });
    setReq(await r.json());
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
      <h1 className="text-xl font-bold">Prividium Send (Phase 2)</h1>
      <p className="text-sm text-emerald-300">Send once to L1 address. Bridge + vault sweep happen automatically.</p>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
      <select value={tokenType} onChange={(e) => setTokenType(e.target.value as 'ETH' | 'ERC20')}>
        <option value="ETH">ETH</option>
        <option value="ERC20">ERC20</option>
      </select>
      <button onClick={generate}>Generate deposit address</button>
      {req && (
        <div className="space-y-1 text-sm">
          <div>trackingId: {req.trackingId}</div>
          <div className="break-all">L1 deposit Y: {req.l1DepositAddress}</div>
          <button onClick={() => navigator.clipboard.writeText(req.l1DepositAddress)}>Copy deposit address</button>
          <div>status: {status?.status ?? 'issued'}</div>
          <div className="mt-2">What happens next:</div>
          <ul>
            {timeline.map((s) => (
              <li key={s}>{status?.status === s || timeline.indexOf(s) <= timeline.indexOf(status?.status) ? '✅' : '•'} {s}</li>
            ))}
          </ul>
          <label><input type="checkbox" checked={showDebug} onChange={() => setShowDebug(!showDebug)} /> show debug</label>
          {showDebug && <div className="break-all">L2 vault X: {req.l2Destination}</div>}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
