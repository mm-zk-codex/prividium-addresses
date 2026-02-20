import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

type AliasResult = 'match' | 'maybe_needs_suffix' | 'not_found';

const TRACKING_COOKIE = 'last_tracking_id';

function setCookie(name: string, value: string, days = 30) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((x) => x.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [showSuffix, setShowSuffix] = useState(false);
  const [message, setMessage] = useState('');
  const [req, setReq] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [acceptedTokens, setAcceptedTokens] = useState<any[]>([]);

  const trackingId = req?.trackingId;
  const trackingLink = useMemo(() => (trackingId ? `${window.location.origin}?trackingId=${trackingId}` : ''), [trackingId]);

  const loadTracking = async (id: string) => {
    const r = await fetch(`${resolver}/deposit/${id}`);
    if (!r.ok) return;
    const data = await r.json();
    setReq({ trackingId: id, l1DepositAddress: data.request?.l1DepositAddressY, l2VaultAddress: data.request?.l2VaultAddressX });
    setStatus(data);
  };

  const requestDeposit = async (payload: { email: string; suffix?: string }) => {
    const r = await fetch(`${resolver}/deposit/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (!r.ok) {
      setMessage(data.error ?? 'Unable to generate');
      return;
    }
    setReq(data);
    setStatus(null);
    setCookie(TRACKING_COOKIE, data.trackingId);
  };

  const continueFlow = async () => {
    setMessage('');
    const existsResp = await fetch(`${resolver}/alias/exists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix: showSuffix ? suffix : undefined })
    });
    const existsData = (await existsResp.json()) as { result: AliasResult };
    if (existsData.result === 'match') {
      await requestDeposit({ email, suffix: showSuffix ? suffix : undefined });
      return;
    }
    if (existsData.result === 'maybe_needs_suffix') {
      setShowSuffix(true);
      setMessage('This recipient might require a suffix. Add suffix and continue.');
      return;
    }
    setMessage('Recipient may need to register in Prividium before receiving deposits.');
  };

  const generateNewAddress = () => {
    clearCookie(TRACKING_COOKIE);
    setReq(null);
    setStatus(null);
  };

  useEffect(() => {
    void (async () => {
      const r = await fetch(`${resolver}/accepted-tokens`);
      if (r.ok) setAcceptedTokens(await r.json());
      const fromUrl = new URL(window.location.href).searchParams.get('trackingId');
      const saved = fromUrl ?? getCookie(TRACKING_COOKIE);
      if (saved) {
        setCookie(TRACKING_COOKIE, saved);
        await loadTracking(saved);
      }
    })();
  }, []);

  useEffect(() => {
    if (!trackingId) return;
    const it = setInterval(async () => {
      await loadTracking(trackingId);
    }, 2500);
    return () => clearInterval(it);
  }, [trackingId]);

  return (
    <div className="card">
      <h1 className="text-xl font-bold">Prividium Send</h1>
      <p className="text-sm text-emerald-300">Transfer ETH or any supported ERC20 to one deposit address.</p>
      <div className="text-xs text-slate-300">Accepted tokens: ETH and the ERC20 list below.</div>
      <ul className="text-xs space-y-1">
        {acceptedTokens.map((t) => (
          <li key={t.l1Address}><b>{t.symbol}</b> {t.name} ({shortAddress(t.l1Address)}) / {t.decimals} decimals</li>
        ))}
      </ul>
      <input placeholder="recipient email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {showSuffix && <input placeholder="suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />}
      <button onClick={continueFlow}>Continue</button>
      {message && <div className="text-xs text-amber-300">{message}</div>}
      {req && (
        <div className="space-y-2 text-sm">
          <div>trackingId: {req.trackingId}</div>
          <div className="break-all">L1 deposit Y: {req.l1DepositAddress}</div>
          <button onClick={() => navigator.clipboard.writeText(req.l1DepositAddress)}>Copy deposit address</button>
          <button onClick={() => navigator.clipboard.writeText(trackingLink)}>Copy tracking link</button>
          <button onClick={generateNewAddress}>Generate new address</button>
          <img className="bg-white inline-block p-2 rounded" width={160} height={160} alt="Deposit address QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`ethereum:${req.l1DepositAddress}`)}`} />
          <div className="text-xs text-slate-300">Scan to pay</div>
          <div className="text-xs text-slate-300">Only these ERC20 tokens are processed automatically.</div>
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
