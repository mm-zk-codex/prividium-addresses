import { useEffect, useMemo, useState } from 'react';
import { aliasKeyFromParts, normalizeEmail } from '@prividium-poc/types';
import { usePrividiumAuth } from '../auth/PrividiumAuth';
import type { AliasResult, SupportedToken } from '../app/types';
import { formatBalanceValue, hasValue, normalizeStatus, shortAddress } from '../app/utils';

function portalSuffixStorageKey(displayName?: string) {
  const normalized = normalizeEmail(displayName ?? '');
  return normalized ? `portal_suffix:${normalized}` : null;
}

function portalSuffixesStorageKey(displayName?: string) {
  const normalized = normalizeEmail(displayName ?? '');
  return normalized ? `portal_suffixes:${normalized}` : null;
}

function normalizeSuffix(value: string) {
  return value.trim().toLowerCase();
}

function toAliasLabel(email: string, suffix: string) {
  const normalizedEmail = normalizeEmail(email);
  return `${normalizedEmail}${suffix ? `#${suffix}` : ''}`;
}

export function PortalPage({ resolver }: { resolver: string }) {
  const auth = usePrividiumAuth();
  const [suffixInput, setSuffixInput] = useState('');
  const [registeredSuffixes, setRegisteredSuffixes] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [showInactiveAddresses, setShowInactiveAddresses] = useState(false);
  const [isAliasRegistered, setIsAliasRegistered] = useState(false);
  const [acceptedTokens, setAcceptedTokens] = useState<SupportedToken[]>([]);
  const registeredAliases = useMemo(
    () => auth.displayName ? registeredSuffixes.map((suffix) => toAliasLabel(auth.displayName, suffix)) : [],
    [auth.displayName, registeredSuffixes]
  );
  const tokenByAddress = useMemo(
    () => Object.fromEntries(acceptedTokens.map((token) => [token.l1Address.toLowerCase(), token])),
    [acceptedTokens]
  );

  const getAssetLabel = (event: any) => {
    if (!event.l1TokenAddress) return 'ETH';
    return tokenByAddress[event.l1TokenAddress.toLowerCase()]?.symbol ?? shortAddress(event.l1TokenAddress);
  };

  const getFormattedAmount = (event: any) => {
    const token = event.l1TokenAddress ? tokenByAddress[event.l1TokenAddress.toLowerCase()] : null;
    const decimals = token?.decimals ?? 18;
    try {
      return formatBalanceValue(BigInt(String(event.amount ?? '0')), decimals);
    } catch {
      return String(event.amount ?? '0');
    }
  };

  const loadRegisteredSuffixes = async () => {
    if (!auth.displayName) {
      setIsAliasRegistered(false);
      setRegisteredSuffixes([]);
      return [];
    }
    const suffixesKey = portalSuffixesStorageKey(auth.displayName);
    const storedSuffixes = suffixesKey ? JSON.parse(window.localStorage.getItem(suffixesKey) ?? '[]') as string[] : [];
    const uniqueSuffixes = [...new Set(storedSuffixes.map(normalizeSuffix))];
    if (uniqueSuffixes.length === 0) {
      const baseResponse = await fetch(`${resolver}/alias/exists`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: auth.displayName, suffix: '' })
      });
      if (!baseResponse.ok) {
        setIsAliasRegistered(false);
        setRegisteredSuffixes([]);
        return [];
      }
      const baseData = (await baseResponse.json()) as { result: AliasResult };
      const suffixes = baseData.result === 'match' ? [''] : [];
      setIsAliasRegistered(suffixes.length > 0);
      setRegisteredSuffixes(suffixes);
      return suffixes;
    }
    const checks = await Promise.all(uniqueSuffixes.map(async (suffix) => {
      const response = await fetch(`${resolver}/alias/exists`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: auth.displayName, suffix })
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { result: AliasResult };
      return data.result === 'match' ? suffix : null;
    }));
    const suffixes = checks.filter((value): value is string => value !== null);
    setIsAliasRegistered(suffixes.length > 0);
    setRegisteredSuffixes(suffixes);
    return suffixes;
  };

  useEffect(() => {
    const suffixKey = portalSuffixStorageKey(auth.displayName);
    const suffixesKey = portalSuffixesStorageKey(auth.displayName);
    if (!suffixKey || !suffixesKey) {
      setSuffixInput('');
      setRegisteredSuffixes([]);
      return;
    }
    const savedSuffix = window.localStorage.getItem(suffixKey);
    const savedSuffixes = JSON.parse(window.localStorage.getItem(suffixesKey) ?? '[]') as string[];
    if (savedSuffix !== null) setSuffixInput(savedSuffix);
    setRegisteredSuffixes([...new Set(savedSuffixes.map(normalizeSuffix))]);
  }, [auth.displayName]);

  const loadDeposits = async () => {
    if (!auth.displayName) return;
    const suffixes = await loadRegisteredSuffixes();
    if (suffixes.length === 0) {
      setRows([]);
      return;
    }
    const normalizedEmail = normalizeEmail(auth.displayName);
    const responses = await Promise.all(suffixes.map(async (suffix) => {
      const aliasKey = aliasKeyFromParts(normalizedEmail, suffix);
      const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
      if (!resp.ok) return [];
      const data = await resp.json() as any[];
      return data.map((row) => ({
        ...row,
        alias: toAliasLabel(auth.displayName, suffix),
        aliasSuffix: suffix
      }));
    }));
    setRows(responses.flat());
  };

  useEffect(() => {
    void (async () => {
      const resp = await fetch(`${resolver}/accepted-tokens`);
      if (resp.ok) setAcceptedTokens(await resp.json());
    })();
  }, [resolver]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setRows([]);
      setIsAliasRegistered(false);
      setRegisteredSuffixes([]);
      return;
    }
    void loadDeposits();
  }, [auth.isAuthenticated, auth.displayName, auth.walletAddress]);

  useEffect(() => {
    if (!auth.isAuthenticated || !isAliasRegistered) return;
    const interval = window.setInterval(() => {
      void loadDeposits();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [auth.isAuthenticated, auth.displayName, auth.walletAddress, isAliasRegistered]);

  const registerAlias = async () => {
    const headers = { 'content-type': 'application/json', ...auth.authHeaders };
    const normalizedSuffix = normalizeSuffix(suffixInput);
    await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ suffix: normalizedSuffix, recipientPrividiumAddress: auth.walletAddress })
    });
    const storageKey = portalSuffixStorageKey(auth.displayName);
    const suffixesKey = portalSuffixesStorageKey(auth.displayName);
    if (storageKey) window.localStorage.setItem(storageKey, normalizedSuffix);
    if (suffixesKey) {
      const merged = [...new Set([...registeredSuffixes, normalizedSuffix])];
      window.localStorage.setItem(suffixesKey, JSON.stringify(merged));
      setRegisteredSuffixes(merged);
    }
    setSuffixInput(normalizedSuffix);
    setIsAliasRegistered(true);
    await loadDeposits();
  };

  const retryEvent = async (eventId: number, suffix: string) => {
    const headers = { 'content-type': 'application/json', ...auth.authHeaders };
    await fetch(`${resolver}/deposit-events/${eventId}/retry`, { method: 'POST', headers, body: JSON.stringify({ suffix }) });
    await loadDeposits();
  };

  const retryAllStuck = async () => {
    const stuck = rows.flatMap((r) => (r.events ?? []).filter((e: any) => e.stuck).map((e: any) => ({ eventId: e.id, suffix: r.aliasSuffix ?? '' })));
    for (const event of stuck) await retryEvent(event.eventId, event.suffix);
  };

  const grouped = useMemo(() => rows.reduce((acc: Record<string, any>, row) => {
    const key = row.l1DepositAddressY ?? 'unknown';
    if (!acc[key]) acc[key] = { address: row.l1DepositAddressY, alias: row.alias ?? auth.displayName, suffix: row.aliasSuffix ?? '', rows: [] as any[] };
    acc[key].rows.push(row);
    return acc;
  }, {}), [auth.displayName, rows]);
  const groupedEntries = useMemo(() => Object.values(grouped) as any[], [grouped]);
  const [activeGroups, inactiveGroups] = useMemo(() => {
    const withActivity: any[] = [];
    const withoutActivity: any[] = [];
    for (const group of groupedEntries) {
      const events = group.rows.flatMap((r: any) => r.events ?? []);
      if (events.some((event: any) => hasValue(event.amount))) withActivity.push(group);
      else withoutActivity.push(group);
    }
    return [withActivity, withoutActivity];
  }, [groupedEntries]);

  useEffect(() => {
    if (inactiveGroups.length === 0) setShowInactiveAddresses(false);
  }, [inactiveGroups.length]);

  const renderGroup = (group: any) => {
    const events = group.rows.flatMap((r: any) => r.events ?? []);
    const totals = events.reduce((acc: Record<string, { amount: bigint; decimals: number }>, e: any) => {
      if (!hasValue(e.amount)) return acc;
      const token = e.l1TokenAddress ? tokenByAddress[e.l1TokenAddress.toLowerCase()] : null;
      const asset = token?.symbol ?? (e.l1TokenAddress ? shortAddress(e.l1TokenAddress) : 'ETH');
      const decimals = token?.decimals ?? 18;
      const amount = BigInt(String(e.amount));
      acc[asset] = {
        amount: (acc[asset]?.amount ?? 0n) + amount,
        decimals
      };
      return acc;
    }, {} as Record<string, { amount: bigint; decimals: number }>);

    return (
      <div key={group.address} className="card">
        <div className="receive-deposits-header">
          <div>
            <div className="tab-subtitle">Alias</div>
            <div className="tab-title" style={{ fontSize: 18 }}>{group.alias}</div>
          </div>
          <div className="tab-subtitle">Deposit address: <span className="mono-block">{shortAddress(group.address)}</span></div>
        </div>

        <div className="receive-refresh-controls" style={{ marginTop: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {(Object.entries(totals) as Array<[string, { amount: bigint; decimals: number }]>).map(([asset, total]) => (
            <span key={asset} className="pill">{asset}: {formatBalanceValue(total.amount, total.decimals)}</span>
          ))}
          {Object.keys(totals).length === 0 ? <span className="tab-subtitle">No deposits yet.</span> : null}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="tx-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tx-empty">No pending deposits</td>
                </tr>
              ) : (
                events.map((e: any) => (
                  <tr key={e.id}>
                    <td>{getAssetLabel(e)}</td>
                    <td>{getFormattedAmount(e)}</td>
                    <td><span className={`status-chip ${e.stuck ? 'status-chip--error' : 'status-chip--pending'}`}>{normalizeStatus(e.status)}</span></td>
                    <td>{e.attempts ?? 0}</td>
                    <td>{e.stuck ? <button style={{ width: 'auto' }} onClick={() => void retryEvent(e.id, group.suffix ?? '')}>Retry</button> : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <details className="receive-tech-details">
          <summary>Technical details</summary>
          <div className="stack-md">
            {group.rows.map((r: any) => (
              <div key={r.trackingId} className="tech-block">
                <div>Tracking: {r.trackingId}</div>
                <div className="mono-block">Vault: {r.l2VaultAddressX}</div>
                {r.events?.some((e: any) => e.stuck) ? <div className="receive-event-stuck-detail">Includes stuck events.</div> : null}
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="tab-header">
          <div>
            <div className="tab-title">Prividium Recipient Portal</div>
            <div className="tab-subtitle">Signed in as: {auth.displayName}</div>
            {isAliasRegistered ? <div className="tab-subtitle">Registered aliases: {registeredAliases.join(', ')}</div> : null}
          </div>
        </div>
        <div className="aave-info">
          <div className="aave-info-row">
            <span>Wallet</span>
            <code>{auth.walletAddress}</code>
          </div>
        </div>
        {!isAliasRegistered ? (
          <div className="receive-setup-card">
            <div className="receive-setup-icon">@</div>
            <div className="receive-setup-heading">Register alias</div>
            <div className="receive-setup-explanation">
              Choose the suffix you want associated with your account so incoming deposits can be routed to you.
            </div>
            <div className="form-group">
              <label htmlFor="portal-suffix">Optional suffix</label>
              <input id="portal-suffix" placeholder="optional suffix" value={suffixInput} onChange={(e) => setSuffixInput(e.target.value)} />
            </div>
            <div className="receive-actions">
              <button className="receive-claim-btn" style={{ width: 'auto' }} onClick={() => void registerAlias()}>
                Register alias
              </button>
            </div>
          </div>
        ) : (
          <div className="stack-md">
            <div className="form-row">
              <input placeholder="optional suffix" value={suffixInput} onChange={(e) => setSuffixInput(e.target.value)} />
              <button className="receive-claim-btn" style={{ width: 'auto' }} onClick={() => void registerAlias()}>Register alias</button>
              <button className="secondary-brand" style={{ width: 'auto' }} onClick={() => void loadDeposits()}>Refresh</button>
            </div>
            {rows.some((r) => (r.events ?? []).some((e: any) => e.stuck)) ? (
              <div className="button-row">
                <button style={{ width: 'auto' }} onClick={() => void retryAllStuck()}>Retry all stuck</button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="page-stack">
        {isAliasRegistered && Object.keys(grouped).length === 0 ? (
          <div className="card">
            <div className="receive-deposits-header">
              <div>
                <div className="tab-subtitle">Aliases</div>
                <div className="tab-title" style={{ fontSize: 18 }}>{registeredAliases.join(', ')}</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Retries</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="tx-empty">No pending deposits</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {activeGroups.map(renderGroup)}
        {showInactiveAddresses ? inactiveGroups.map(renderGroup) : null}
        {inactiveGroups.length > 0 ? (
          <button
            type="button"
            className="portal-toggle-empty"
            onClick={() => setShowInactiveAddresses((value) => !value)}
          >
            <span>{showInactiveAddresses ? 'Hide addresses with no activity' : 'Show all'}</span>
            <span className={`portal-toggle-empty__chevron ${showInactiveAddresses ? 'open' : ''}`} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
