import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { aliasKeyFromParts, normalizeEmail } from '@prividium-poc/types';
import { Layout } from './components/Layout';
import { LoginGate } from './components/LoginGate';
import { PrividiumAuthProvider, usePrividiumAuth } from './auth/PrividiumAuth';
import './index.css';
const TRACKING_COOKIE = 'last_tracking_id';
const STATUS_LABELS = {
    detected_l1: 'Deposit received',
    l1_forwarder_deployed: 'Preparing bridge',
    l1_bridging_submitted: 'Bridging to Prividium',
    l2_arrived: 'Arrived on Prividium (deposit address)',
    l2_forwarder_deployed: 'Finalizing (forwarder deployed)',
    l2_swept_y_to_x: 'Finalizing (internal forwarding)',
    l2_vault_deployed: 'Finalizing',
    credited: 'Completed',
    pending: 'Pending',
    stuck: 'Needs attention',
    l1_failed: 'Needs attention',
    l2_failed: 'Needs attention',
    error: 'Needs attention',
    failed: 'Needs attention'
};
const STATUS_STEP = {
    detected_l1: 'deposit',
    l1_forwarder_deployed: 'bridge',
    l1_bridging_submitted: 'bridge',
    l2_arrived: 'finalize',
    l2_forwarder_deployed: 'finalize',
    l2_swept_y_to_x: 'finalize',
    l2_vault_deployed: 'finalize',
    credited: 'complete'
};
const STATUS_BADGE_CLASS = {
    detected_l1: 'bg-amber-500/20 text-amber-200 border border-amber-400/30',
    l1_forwarder_deployed: 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30',
    l1_bridging_submitted: 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30',
    l2_arrived: 'bg-blue-500/20 text-blue-200 border border-blue-400/30',
    l2_forwarder_deployed: 'bg-blue-500/20 text-blue-200 border border-blue-400/30',
    l2_swept_y_to_x: 'bg-blue-500/20 text-blue-200 border border-blue-400/30',
    l2_vault_deployed: 'bg-blue-500/20 text-blue-200 border border-blue-400/30',
    credited: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30',
    stuck: 'bg-red-500/20 text-red-200 border border-red-400/30',
    l1_failed: 'bg-red-500/20 text-red-200 border border-red-400/30',
    l2_failed: 'bg-red-500/20 text-red-200 border border-red-400/30'
};
const statusBadgeClass = (status, stuck) => {
    if (stuck)
        return STATUS_BADGE_CLASS.stuck;
    return STATUS_BADGE_CLASS[status.toLowerCase()] ?? 'bg-slate-500/20 text-slate-200 border border-slate-400/30';
};
function setCookie(name, value, days = 30) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}`;
}
function getCookie(name) {
    const match = document.cookie.split('; ').find((x) => x.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}
function clearCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0`;
}
const shortAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const normalizeStatus = (status) => STATUS_LABELS[(status ?? '').toLowerCase()] ?? 'In progress';
const hasValue = (amount) => {
    try {
        return BigInt(String(amount ?? '0')) > 0n;
    }
    catch {
        return false;
    }
};
const statusStep = (status, stuck) => {
    if (stuck)
        return 'bridge';
    const normalized = (status ?? '').toLowerCase();
    return STATUS_STEP[normalized] ?? 'deposit';
};
function getInitialRoute() {
    return window.location.pathname.startsWith('/portal') ? '/portal' : '/send';
}
function App() {
    const resolver = import.meta.env.VITE_RESOLVER_URL ?? 'http://localhost:4000';
    const auth = usePrividiumAuth();
    const [route, setRoute] = useState(getInitialRoute());
    const navigate = (to) => {
        if (window.location.pathname !== to)
            window.history.pushState({}, '', to);
        setRoute(to);
    };
    useEffect(() => {
        const onPopState = () => setRoute(getInitialRoute());
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);
    return (_jsx(Layout, { route: route, navigate: navigate, children: route === '/portal' ? (auth.isAuthenticated ? (_jsx(PortalPage, { resolver: resolver })) : (_jsx(LoginGate, { onLogin: async () => {
                await auth.login();
                await auth.refresh();
                navigate('/portal');
            } }))) : (_jsx(SendPage, { resolver: resolver })) }));
}
function FlowStepper({ events }) {
    const steps = [
        { key: 'deposit', label: 'Deposit received', icon: '📥' },
        { key: 'bridge', label: 'Bridging to Prividium', icon: '🌉' },
        { key: 'finalize', label: 'Finalizing', icon: '🧾' },
        { key: 'complete', label: 'Completed', icon: '✅' }
    ];
    const activeIndex = Math.max(0, ...events.map((e) => steps.findIndex((s) => s.key === statusStep(e.status, e.stuck))));
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("h3", { className: "text-sm font-semibold text-slate-200", children: "Transfer progress" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3", children: steps.map((step, idx) => {
                    const completed = idx < activeIndex || (idx === activeIndex && activeIndex === steps.length - 1);
                    const current = idx === activeIndex;
                    return (_jsxs("div", { className: `rounded-xl border p-3 ${completed ? 'border-emerald-400/40 bg-emerald-500/10' : current ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/40'}`, children: [_jsx("div", { className: "text-lg", "aria-hidden": true, children: step.icon }), _jsx("div", { className: "text-sm font-medium mt-1", children: step.label }), _jsx("div", { className: "text-xs text-slate-300 mt-1", children: completed ? 'Done' : current ? 'In progress' : 'Pending' })] }, step.key));
                }) })] }));
}
function SendPage({ resolver }) {
    const [email, setEmail] = useState('');
    const [suffix, setSuffix] = useState('');
    const [showSuffix, setShowSuffix] = useState(false);
    const [message, setMessage] = useState('');
    const [req, setReq] = useState(null);
    const [status, setStatus] = useState(null);
    const [support, setSupport] = useState(null);
    const [supportAvailable, setSupportAvailable] = useState(null);
    const [acceptedTokens, setAcceptedTokens] = useState([]);
    const [lastPayload, setLastPayload] = useState(null);
    const trackingId = req?.trackingId;
    const trackingLink = useMemo(() => (trackingId ? `${window.location.origin}/send?trackingId=${trackingId}` : ''), [trackingId]);
    const events = status?.events ?? [];
    const transferEvents = events.filter((e) => hasValue(e.amount));
    const loadTracking = async (id) => {
        const r = await fetch(`${resolver}/deposit/${id}`);
        if (!r.ok)
            return;
        const data = await r.json();
        setReq({ trackingId: id, l1DepositAddress: data.request?.l1DepositAddressY, l2VaultAddress: data.request?.l2VaultAddressX });
        setStatus(data);
    };
    const loadSupport = async (id) => {
        if (supportAvailable === false)
            return;
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
    const requestDeposit = async (payload) => {
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
        setLastPayload(payload);
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
        const existsData = (await existsResp.json());
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
    const generateNewAddress = async () => {
        clearCookie(TRACKING_COOKIE);
        if (lastPayload) {
            await requestDeposit(lastPayload);
            return;
        }
        setReq(null);
        setStatus(null);
        setSupport(null);
        setSupportAvailable(null);
        setMessage('Enter recipient details and continue to generate a new address.');
    };
    useEffect(() => {
        void (async () => {
            const r = await fetch(`${resolver}/accepted-tokens`);
            if (r.ok)
                setAcceptedTokens(await r.json());
            const fromUrl = new URL(window.location.href).searchParams.get('trackingId');
            const saved = fromUrl ?? getCookie(TRACKING_COOKIE);
            if (saved) {
                setCookie(TRACKING_COOKIE, saved);
                await loadTracking(saved);
            }
        })();
    }, []);
    useEffect(() => {
        if (!trackingId)
            return;
        const it = setInterval(async () => {
            await loadTracking(trackingId);
        }, 2500);
        return () => clearInterval(it);
    }, [trackingId]);
    useEffect(() => {
        if (!trackingId)
            return;
        void loadSupport(trackingId);
    }, [trackingId]);
    const hasStuckEvent = transferEvents.some((e) => e.stuck);
    return (_jsxs("div", { className: "card space-y-6", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Prividium Send" }), _jsx("p", { className: "text-sm text-slate-300", children: "Send ETH or supported ERC20 tokens to one deposit address. We handle the rest." })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-[1fr_auto]", children: [_jsx("input", { placeholder: "recipient email", value: email, onChange: (e) => setEmail(e.target.value) }), _jsx("button", { className: "btn-primary", onClick: () => void continueFlow(), children: "Continue" }), showSuffix && _jsx("input", { className: "sm:col-span-2", placeholder: "suffix", value: suffix, onChange: (e) => setSuffix(e.target.value) })] }), message && _jsx("div", { className: "text-sm text-amber-300", children: message }), _jsxs("section", { className: "space-y-3", children: [_jsx("h2", { className: "text-sm font-semibold text-slate-200", children: "Supported tokens" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2", children: acceptedTokens.map((t) => (_jsxs("div", { className: "border border-slate-700 rounded-xl p-3 bg-slate-900/30", children: [_jsx("div", { className: "font-semibold", children: t.symbol }), _jsx("div", { className: "text-sm text-slate-300", children: t.name }), _jsx("div", { className: "text-xs text-slate-400 font-mono break-all mt-1", children: t.l1Address })] }, t.l1Address))) })] }), req && (_jsxs("div", { className: "space-y-5", children: [_jsxs("div", { className: "border border-indigo-400/30 rounded-2xl p-4 md:p-5 bg-indigo-500/10", children: [_jsx("h2", { className: "font-semibold text-lg", children: "Deposit address" }), _jsx("div", { className: "break-all text-sm mt-2", children: req.l1DepositAddress }), _jsxs("div", { className: "flex flex-wrap gap-2 mt-3", children: [_jsx("button", { className: "btn-primary", onClick: () => navigator.clipboard.writeText(req.l1DepositAddress), children: "Copy address" }), _jsx("button", { className: "btn-secondary", onClick: () => navigator.clipboard.writeText(trackingLink), children: "Copy tracking link" }), _jsx("button", { className: "btn-secondary", onClick: () => void generateNewAddress(), children: "Generate new address" })] }), _jsxs("div", { className: "mt-4 flex items-center gap-4 flex-wrap", children: [_jsx("img", { className: "bg-white inline-block p-2 rounded", width: 160, height: 160, alt: "Deposit address QR", src: `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`ethereum:${req.l1DepositAddress}`)}` }), _jsx("div", { className: "text-xs text-slate-300", children: "Scan QR to pay from your wallet." })] }), _jsxs("div", { className: "text-xs text-slate-400 mt-3", children: ["Details: tracking ID ", req.trackingId] })] }), transferEvents.length > 0 ? _jsx(FlowStepper, { events: transferEvents }) : null, _jsxs("details", { className: "border border-slate-700 rounded-xl p-3 bg-slate-900/30", children: [_jsx("summary", { className: "cursor-pointer text-sm font-semibold", children: "Deposit history" }), _jsxs("div", { className: "mt-3 space-y-2", children: [events.length === 0 ? _jsx("div", { className: "text-xs text-slate-400", children: "No events yet." }) : null, events.map((e) => (_jsxs("div", { className: `rounded-lg border p-3 ${e.stuck ? 'border-red-400/40 bg-red-500/10' : 'border-slate-700 bg-slate-900/40'}`, children: [_jsxs("div", { className: "flex items-center justify-between gap-2 flex-wrap", children: [_jsxs("div", { className: "text-sm font-medium", children: [e.kind, " \u2022 ", e.amount] }), _jsx("span", { className: `text-xs px-2 py-1 rounded-full ${statusBadgeClass(e.status, e.stuck)}`, children: normalizeStatus(e.status) })] }), _jsxs("div", { className: "text-xs text-slate-400 mt-1", children: ["Asset: ", e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH'] })] }, e.id)))] })] }), _jsxs("div", { className: "border border-slate-700 rounded-xl p-3 space-y-2 text-sm", children: [_jsx("h3", { className: "font-semibold", children: "Support" }), hasStuckEvent ? (_jsx("div", { className: "text-red-200 bg-red-500/10 border border-red-400/30 rounded p-2", children: "A transfer looks stuck. You can use the support details below when contacting support." })) : (_jsx("div", { className: "text-slate-300", children: "Everything appears to be progressing normally." })), support ? (_jsxs(_Fragment, { children: [hasStuckEvent && support?.code ? (_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs", children: [_jsxs("span", { className: "text-slate-300", children: ["Support code: ", _jsx("b", { children: support.code })] }), _jsx("button", { className: "btn-secondary", onClick: () => navigator.clipboard.writeText(String(support.code)), children: "Copy support code" })] })) : null, _jsxs("details", { className: "text-xs", children: [_jsx("summary", { className: "cursor-pointer font-semibold", children: "Technical details" }), _jsx("pre", { className: "whitespace-pre-wrap mt-2 bg-slate-950/60 p-2 rounded", children: JSON.stringify(support, null, 2) })] })] })) : supportAvailable === false ? (_jsx("div", { className: "text-slate-300 text-xs", children: "Support endpoint is not enabled on this deployment." })) : (_jsx("div", { className: "text-slate-300 text-xs", children: "Support details appear here when available." }))] })] }))] }));
}
function PortalPage({ resolver }) {
    const auth = usePrividiumAuth();
    const [suffix, setSuffix] = useState('');
    const [rows, setRows] = useState([]);
    const loadDeposits = async () => {
        if (!auth.displayName)
            return;
        const aliasKey = aliasKeyFromParts(normalizeEmail(auth.displayName), suffix.trim().toLowerCase());
        const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
        if (resp.ok)
            setRows(await resp.json());
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
    const retryEvent = async (eventId) => {
        const headers = { 'content-type': 'application/json', ...auth.authHeaders };
        await fetch(`${resolver}/deposit-events/${eventId}/retry`, { method: 'POST', headers, body: JSON.stringify({ suffix }) });
        await loadDeposits();
    };
    const retryAllStuck = async () => {
        const stuck = rows.flatMap((r) => (r.events ?? []).filter((e) => e.stuck));
        for (const event of stuck)
            await retryEvent(event.id);
    };
    const grouped = rows.reduce((acc, row) => {
        const key = row.l1DepositAddressY ?? 'unknown';
        if (!acc[key])
            acc[key] = { address: row.l1DepositAddressY, alias: row.alias ?? auth.displayName, rows: [] };
        acc[key].rows.push(row);
        return acc;
    }, {});
    return (_jsxs("div", { className: "card space-y-6", children: [_jsx("h1", { className: "text-2xl font-bold", children: "Prividium Recipient Portal" }), _jsxs("div", { className: "text-sm", children: ["Signed in as: ", auth.displayName] }), _jsxs("div", { className: "break-all text-sm text-slate-300", children: ["Wallet: ", auth.walletAddress] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]", children: [_jsx("input", { placeholder: "optional suffix", value: suffix, onChange: (e) => setSuffix(e.target.value) }), _jsx("button", { className: "btn-secondary", onClick: () => void registerAlias(), children: "Register alias" }), _jsx("button", { className: "btn-secondary", onClick: () => void loadDeposits(), children: "Refresh" }), _jsx("button", { className: "btn-primary", onClick: () => void retryAllStuck(), children: "Retry all stuck" })] }), _jsx("div", { className: "space-y-4", children: Object.values(grouped).map((group) => {
                    const events = group.rows.flatMap((r) => r.events ?? []);
                    const totals = events.reduce((acc, e) => {
                        if (!hasValue(e.amount))
                            return acc;
                        const asset = e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH';
                        acc[asset] = (acc[asset] ?? 0n) + BigInt(String(e.amount));
                        return acc;
                    }, {});
                    return (_jsxs("div", { className: "border border-slate-700 rounded-2xl p-4 space-y-3 bg-slate-900/30", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm text-slate-300", children: "Alias" }), _jsx("div", { className: "font-semibold", children: group.alias })] }), _jsxs("div", { className: "text-sm text-slate-300", children: ["Deposit address: ", _jsx("span", { className: "font-mono", children: shortAddress(group.address) })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2 text-xs", children: [Object.entries(totals).map(([asset, amount]) => (_jsxs("span", { className: "px-2 py-1 rounded-full bg-slate-800 border border-slate-700", children: [asset, ": ", String(amount)] }, asset))), Object.keys(totals).length === 0 ? _jsx("span", { className: "text-slate-400", children: "No deposits yet." }) : null] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-xs md:text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-left border-b border-slate-700 text-slate-300", children: [_jsx("th", { className: "py-2 pr-2", children: "Asset" }), _jsx("th", { className: "py-2 pr-2", children: "Amount" }), _jsx("th", { className: "py-2 pr-2", children: "Status" }), _jsx("th", { className: "py-2 pr-2", children: "Attempts" }), _jsx("th", { className: "py-2 pr-2", children: "Action" })] }) }), _jsx("tbody", { children: events.map((e) => (_jsxs("tr", { className: e.stuck ? 'bg-red-500/10' : '', children: [_jsx("td", { className: "py-2 pr-2", children: e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH' }), _jsx("td", { className: "py-2 pr-2", children: e.amount }), _jsx("td", { className: "py-2 pr-2", children: _jsx("span", { className: `text-xs px-2 py-1 rounded-full ${statusBadgeClass(e.status, e.stuck)}`, children: normalizeStatus(e.status) }) }), _jsx("td", { className: "py-2 pr-2", children: e.attempts ?? 0 }), _jsx("td", { className: "py-2 pr-2", children: e.stuck ? _jsx("button", { className: "btn-primary", onClick: () => void retryEvent(e.id), children: "Retry" }) : '—' })] }, e.id))) })] }) }), _jsxs("details", { className: "text-xs", children: [_jsx("summary", { className: "cursor-pointer font-semibold text-slate-300", children: "Technical details" }), _jsx("div", { className: "mt-2 space-y-2", children: group.rows.map((r) => (_jsxs("div", { className: "bg-slate-950/50 border border-slate-700 rounded p-2", children: [_jsxs("div", { children: ["Tracking: ", r.trackingId] }), _jsxs("div", { className: "break-all", children: ["Vault: ", r.l2VaultAddressX] }), r.events?.some((e) => e.stuck) ? _jsx("div", { className: "text-red-200", children: "Includes stuck events." }) : null] }, r.trackingId))) })] })] }, group.address));
                }) })] }));
}
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(PrividiumAuthProvider, { children: _jsx(App, {}) }));
