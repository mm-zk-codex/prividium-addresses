import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { aliasKeyFromParts, normalizeEmail } from '@prividium-poc/types';
import { Layout } from './components/Layout';
import { LoginGate } from './components/LoginGate';
import { PrividiumAuthProvider, usePrividiumAuth } from './auth/PrividiumAuth';
import './index.css';

type AliasResult = 'match' | 'maybe_needs_suffix' | 'not_found';
type Route = '/send' | '/portal';

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

function getInitialRoute(): Route {
  return window.location.pathname.startsWith('/portal') ? '/portal' : '/send';
}

function App() {
  const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
  const auth = usePrividiumAuth();
  const [route, setRoute] = useState<Route>(getInitialRoute());

  const navigate = (to: Route) => {
    if (window.location.pathname !== to) window.history.pushState({}, '', to);
    setRoute(to);
  };

  useEffect(() => {
    const onPopState = () => setRoute(getInitialRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <Layout route={route} navigate={navigate}>
      {route === '/portal' ? (
        auth.isAuthenticated ? (
          <PortalPage resolver={resolver} />
        ) : (
          <LoginGate onLogin={async () => {
            await auth.login();
            await auth.refresh();
            navigate('/portal');
          }} />
        )
      ) : (
        <SendPage resolver={resolver} />
      )}
    </Layout>
  );
}

function SendPage({ resolver }: { resolver: string }) {
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [showSuffix, setShowSuffix] = useState(false);
  const [message, setMessage] = useState('');
  const [req, setReq] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [support, setSupport] = useState<any>(null);
  const [supportAvailable, setSupportAvailable] = useState<boolean | null>(null);
  const [acceptedTokens, setAcceptedTokens] = useState<any[]>([]);

  const trackingId = req?.trackingId;
  const trackingLink = useMemo(() => (trackingId ? `${window.location.origin}/send?trackingId=${trackingId}` : ''), [trackingId]);

  const loadTracking = async (id: string) => {
    const r = await fetch(`${resolver}/deposit/${id}`);
    if (!r.ok) return;
    const data = await r.json();
    setReq({ trackingId: id, l1DepositAddress: data.request?.l1DepositAddressY, l2VaultAddress: data.request?.l2VaultAddressX });
    setStatus(data);
  };

  const loadSupport = async (id: string) => {
    if (supportAvailable === false) return;
    const supportResp = await fetch(`${resolver}/deposit/${id}/support`);
    if (supportResp.ok) {
      setSupport(await supportResp.json());
      setSupportAvailable(true);
      return;
    }
    if (supportResp.status === 404) {
      setSupportAvailable(false);
      setSupport(null);
    }
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
    setSupport(null);
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
    setSupport(null);
    setSupportAvailable(null);
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

  useEffect(() => {
    if (!trackingId) return;
    void loadSupport(trackingId);
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
      <button onClick={() => void continueFlow()}>Continue</button>
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
          <ul className="space-y-1 text-xs">
            {(status?.events ?? []).map((e: any) => (
              <li key={e.id} className="border border-slate-700 rounded p-2">
                <div>{e.kind} {e.l1TokenAddress ? `(${e.l1TokenAddress})` : ''}</div>
                <div>amount: {e.amount}</div>
                <div>status: {e.status}</div>
              </li>
            ))}
          </ul>
          <div className="border border-slate-700 rounded p-3 space-y-1 text-xs">
            <h3 className="font-semibold text-sm">Support / troubleshooting</h3>
            {support ? (
              <pre className="whitespace-pre-wrap">{JSON.stringify(support, null, 2)}</pre>
            ) : supportAvailable === false ? (
              <div className="text-slate-300">Support endpoint is not enabled on this deployment.</div>
            ) : (
              <div className="text-slate-300">Support details appear here when available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PortalPage({ resolver }: { resolver: string }) {
  const auth = usePrividiumAuth();
  const [suffix, setSuffix] = useState('');
  const [rows, setRows] = useState<any[]>([]);

  const loadDeposits = async () => {
    if (!auth.displayName) return;
    const aliasKey = aliasKeyFromParts(normalizeEmail(auth.displayName), suffix.trim().toLowerCase());
    const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
    if (resp.ok) setRows(await resp.json());
  };

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setRows([]);
      return;
    }
    void loadDeposits();
  }, [auth.isAuthenticated, auth.displayName, auth.walletAddress]);

  const registerAlias = async () => {
    const headers = { 'content-type': 'application/json', ...auth.authHeaders };
    await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ suffix, recipientPrividiumAddress: auth.walletAddress })
    });
    await loadDeposits();
  };

  const retryEvent = async (eventId: number) => {
    const headers = { 'content-type': 'application/json', ...auth.authHeaders };
    await fetch(`${resolver}/deposit-events/${eventId}/retry`, { method: 'POST', headers, body: JSON.stringify({ suffix }) });
    await loadDeposits();
  };

  const retryAllStuck = async () => {
    const stuck = rows.flatMap((r) => (r.events ?? []).filter((e: any) => e.stuck));
    for (const event of stuck) {
      await retryEvent(event.id);
    }
  };

  return (
    <div className="card">
      <h1 className="text-xl font-bold">Prividium Recipient Portal</h1>
      <div className="text-sm">Signed in as: {auth.displayName}</div>
      <div className="break-all text-sm">Your wallet address: {auth.walletAddress}</div>
      <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => void registerAlias()}>Register alias</button>
        <button onClick={() => void loadDeposits()}>Refresh deposit flow status</button>
        <button onClick={() => void retryAllStuck()}>Retry all stuck</button>
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
                {e.stuck ? <button onClick={() => void retryEvent(e.id)}>Retry</button> : null}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PrividiumAuthProvider>
    <App />
  </PrividiumAuthProvider>
);
