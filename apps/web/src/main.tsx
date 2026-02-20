import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { aliasKeyFromParts, normalizeEmail } from '@prividium-poc/types';
import { Layout } from './components/Layout';
import { LoginGate } from './components/LoginGate';
import { PrividiumAuthProvider, usePrividiumAuth } from './auth/PrividiumAuth';
import './index.css';

type AliasResult = 'match' | 'maybe_needs_suffix' | 'not_found';
type Route = '/send' | '/portal';

type StepperStep = 'deposit' | 'bridge' | 'finalize' | 'complete';

const TRACKING_COOKIE = 'last_tracking_id';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  observed: 'Deposit received',
  received: 'Deposit received',
  detected: 'Deposit received',
  initiated: 'Bridging to Prividium',
  proving: 'Bridging to Prividium',
  proving_started: 'Bridging to Prividium',
  relayed: 'Finalizing',
  finalized: 'Completed',
  completed: 'Completed',
  failed: 'Needs attention',
  error: 'Needs attention',
  stuck: 'Needs attention'
};

const statusBadgeClass = (status: string, stuck?: boolean) => {
  if (stuck) return 'bg-red-500/20 text-red-200 border border-red-400/30';
  const normalized = status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('finalized')) return 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30';
  if (normalized.includes('final') || normalized.includes('relay')) return 'bg-blue-500/20 text-blue-200 border border-blue-400/30';
  if (normalized.includes('bridge') || normalized.includes('init') || normalized.includes('prov')) return 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30';
  if (normalized.includes('observ') || normalized.includes('receive') || normalized.includes('detect')) return 'bg-amber-500/20 text-amber-200 border border-amber-400/30';
  return 'bg-slate-500/20 text-slate-200 border border-slate-400/30';
};

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
const normalizeStatus = (status?: string) => STATUS_LABELS[(status ?? '').toLowerCase()] ?? 'In progress';

const statusStep = (status?: string, stuck?: boolean): StepperStep => {
  if (stuck) return 'bridge';
  const s = (status ?? '').toLowerCase();
  if (s.includes('complete') || s.includes('finalized')) return 'complete';
  if (s.includes('final') || s.includes('relay')) return 'finalize';
  if (s.includes('bridge') || s.includes('prov') || s.includes('init')) return 'bridge';
  return 'deposit';
};

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

function FlowStepper({ events }: { events: any[] }) {
  const steps = [
    { key: 'deposit', label: 'Deposit received', icon: '📥' },
    { key: 'bridge', label: 'Bridging to Prividium', icon: '🌉' },
    { key: 'finalize', label: 'Finalizing', icon: '🧾' },
    { key: 'complete', label: 'Completed', icon: '✅' }
  ] as const;

  const activeIndex = events.length
    ? Math.max(...events.map((e) => steps.findIndex((s) => s.key === statusStep(e.status, e.stuck))))
    : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">Transfer progress</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step, idx) => {
          const completed = idx < activeIndex || (idx === activeIndex && activeIndex === steps.length - 1);
          const current = idx === activeIndex;
          return (
            <div key={step.key} className={`rounded-xl border p-3 ${completed ? 'border-emerald-400/40 bg-emerald-500/10' : current ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/40'}`}>
              <div className="text-lg" aria-hidden>{step.icon}</div>
              <div className="text-sm font-medium mt-1">{step.label}</div>
              <div className="text-xs text-slate-300 mt-1">{completed ? 'Done' : current ? 'In progress' : 'Pending'}</div>
            </div>
          );
        })}
      </div>
    </div>
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
  const events = status?.events ?? [];

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

  const hasStuckEvent = events.some((e: any) => e.stuck);

  return (
    <div className="card space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Prividium Send</h1>
        <p className="text-sm text-slate-300">Send ETH or supported ERC20 tokens to one deposit address. We handle the rest.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input placeholder="recipient email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary" onClick={() => void continueFlow()}>Continue</button>
        {showSuffix && <input className="sm:col-span-2" placeholder="suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />}
      </div>
      {message && <div className="text-sm text-amber-300">{message}</div>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-200">Supported tokens</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {acceptedTokens.map((t) => (
            <div key={t.l1Address} className="border border-slate-700 rounded-xl p-3 bg-slate-900/30">
              <div className="font-semibold">{t.symbol}</div>
              <div className="text-sm text-slate-300">{t.name}</div>
            </div>
          ))}
        </div>
      </section>

      {req && (
        <div className="space-y-5">
          <div className="border border-indigo-400/30 rounded-2xl p-4 md:p-5 bg-indigo-500/10">
            <h2 className="font-semibold text-lg">Deposit address</h2>
            <div className="break-all text-sm mt-2">{req.l1DepositAddress}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="btn-primary" onClick={() => navigator.clipboard.writeText(req.l1DepositAddress)}>Copy address</button>
              <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(trackingLink)}>Copy tracking link</button>
              <button className="btn-secondary" onClick={generateNewAddress}>Generate new address</button>
            </div>
            <div className="mt-4 flex items-center gap-4 flex-wrap">
              <img className="bg-white inline-block p-2 rounded" width={160} height={160} alt="Deposit address QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`ethereum:${req.l1DepositAddress}`)}`} />
              <div className="text-xs text-slate-300">Scan QR to pay from your wallet.</div>
            </div>
            <div className="text-xs text-slate-400 mt-3">Details: tracking ID {req.trackingId}</div>
          </div>

          <FlowStepper events={events} />

          <details className="border border-slate-700 rounded-xl p-3 bg-slate-900/30">
            <summary className="cursor-pointer text-sm font-semibold">Deposit history</summary>
            <div className="mt-3 space-y-2">
              {events.length === 0 ? <div className="text-xs text-slate-400">No events yet.</div> : null}
              {events.map((e: any) => (
                <div key={e.id} className={`rounded-lg border p-3 ${e.stuck ? 'border-red-400/40 bg-red-500/10' : 'border-slate-700 bg-slate-900/40'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">{e.kind} • {e.amount}</div>
                    <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(e.status, e.stuck)}`}>{normalizeStatus(e.status)}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Asset: {e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH'}</div>
                </div>
              ))}
            </div>
          </details>

          <div className="border border-slate-700 rounded-xl p-3 space-y-2 text-sm">
            <h3 className="font-semibold">Support</h3>
            {hasStuckEvent ? (
              <div className="text-red-200 bg-red-500/10 border border-red-400/30 rounded p-2">A transfer looks stuck. You can use the support details below when contacting support.</div>
            ) : (
              <div className="text-slate-300">Everything appears to be progressing normally.</div>
            )}

            {support ? (
              <>
                {hasStuckEvent && support?.code ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-300">Support code: <b>{support.code}</b></span>
                    <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(String(support.code))}>Copy support code</button>
                  </div>
                ) : null}
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold">Technical details</summary>
                  <pre className="whitespace-pre-wrap mt-2 bg-slate-950/60 p-2 rounded">{JSON.stringify(support, null, 2)}</pre>
                </details>
              </>
            ) : supportAvailable === false ? (
              <div className="text-slate-300 text-xs">Support endpoint is not enabled on this deployment.</div>
            ) : (
              <div className="text-slate-300 text-xs">Support details appear here when available.</div>
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

  const grouped = rows.reduce((acc: Record<string, any>, row) => {
    const key = row.l1DepositAddressY ?? 'unknown';
    if (!acc[key]) {
      acc[key] = { address: row.l1DepositAddressY, alias: row.alias ?? auth.displayName, vault: row.l2VaultAddressX, rows: [] as any[] };
    }
    acc[key].rows.push(row);
    return acc;
  }, {});

  return (
    <div className="card space-y-6">
      <h1 className="text-2xl font-bold">Prividium Recipient Portal</h1>
      <div className="text-sm">Signed in as: {auth.displayName}</div>
      <div className="break-all text-sm text-slate-300">Wallet: {auth.walletAddress}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        <button className="btn-secondary" onClick={() => void registerAlias()}>Register alias</button>
        <button className="btn-secondary" onClick={() => void loadDeposits()}>Refresh</button>
        <button className="btn-primary" onClick={() => void retryAllStuck()}>Retry all stuck</button>
      </div>

      <div className="space-y-4">
        {Object.values(grouped).map((group: any) => {
          const events = group.rows.flatMap((r: any) => r.events ?? []);
          const totals = events.reduce((acc: Record<string, number>, e: any) => {
            const asset = e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH';
            acc[asset] = (acc[asset] ?? 0) + Number(e.amount ?? 0);
            return acc;
          }, {});

          return (
            <div key={group.address} className="border border-slate-700 rounded-2xl p-4 space-y-3 bg-slate-900/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-300">Alias</div>
                  <div className="font-semibold">{group.alias}</div>
                </div>
                <div className="text-sm text-slate-300">Deposit address: <span className="font-mono">{shortAddress(group.address)}</span></div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(totals).map(([asset, amount]) => (
                  <span key={asset} className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700">{asset}: {amount as number}</span>
                ))}
                {Object.keys(totals).length === 0 ? <span className="text-slate-400">No deposits yet.</span> : null}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-700 text-slate-300">
                      <th className="py-2 pr-2">Asset</th>
                      <th className="py-2 pr-2">Amount</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Attempts</th>
                      <th className="py-2 pr-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e: any) => (
                      <tr key={e.id} className={e.stuck ? 'bg-red-500/10' : ''}>
                        <td className="py-2 pr-2">{e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH'}</td>
                        <td className="py-2 pr-2">{e.amount}</td>
                        <td className="py-2 pr-2"><span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(e.status, e.stuck)}`}>{normalizeStatus(e.status)}</span></td>
                        <td className="py-2 pr-2">{e.attempts ?? 0}</td>
                        <td className="py-2 pr-2">{e.stuck ? <button className="btn-primary" onClick={() => void retryEvent(e.id)}>Retry</button> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-slate-300">Technical details</summary>
                <div className="mt-2 space-y-2">
                  {group.rows.map((r: any) => (
                    <div key={r.trackingId} className="bg-slate-950/50 border border-slate-700 rounded p-2">
                      <div>Tracking: {r.trackingId}</div>
                      <div className="break-all">Vault: {r.l2VaultAddressX}</div>
                      {r.events?.some((e: any) => e.stuck) ? <div className="text-red-200">Includes stuck events.</div> : null}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PrividiumAuthProvider>
    <App />
  </PrividiumAuthProvider>
);
