import { useEffect, useMemo, useState } from 'react';
import { aliasKeyFromParts } from '@prividium-poc/types';
import { usePrividiumAuth } from '../auth/PrividiumAuth';
import type { AliasResult, SupportedToken } from '../app/types';
import { formatBalanceValue, hasValue, normalizeStatus, shortAddress } from '../app/utils';

export function PortalPage({ resolver }: { resolver: string }) {
  const auth = usePrividiumAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [showInactiveAddresses, setShowInactiveAddresses] = useState(false);
  const [isAliasRegistered, setIsAliasRegistered] = useState(false);
  const [acceptedTokens, setAcceptedTokens] = useState<SupportedToken[]>([]);
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

  const loadDeposits = async () => {
    if (!auth.displayName) return;

    const existsResponse = await fetch(`${resolver}/alias/exists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: auth.displayName })
    });
    if (!existsResponse.ok) {
      setIsAliasRegistered(false);
      setRows([]);
      return;
    }

    const existsData = (await existsResponse.json()) as { result: AliasResult };
    const registered = existsData.result === 'match';
    setIsAliasRegistered(registered);
    if (!registered) {
      setRows([]);
      return;
    }

    const aliasKey = aliasKeyFromParts(auth.displayName, '');
    const resp = await fetch(`${resolver}/alias/deposits?aliasKey=${aliasKey}`);
    if (!resp.ok) {
      setRows([]);
      return;
    }
    const data = await resp.json() as any[];
    setRows(
      data.map((row) => ({
        ...row,
        alias: auth.displayName
      }))
    );
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
    await fetch(`${resolver}/alias/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipientPrividiumAddress: auth.walletAddress })
    });
    setIsAliasRegistered(true);
    await loadDeposits();
  };

  const retryEvent = async (eventId: number) => {
    const headers = { 'content-type': 'application/json', ...auth.authHeaders };
    await fetch(`${resolver}/deposit-events/${eventId}/retry`, { method: 'POST', headers, body: JSON.stringify({}) });
    await loadDeposits();
  };

  const retryAllStuck = async () => {
    const stuck = rows.flatMap((r) => (r.events ?? []).filter((e: any) => e.stuck).map((e: any) => e.id));
    for (const eventId of stuck) await retryEvent(eventId);
  };

  const grouped = useMemo(
    () =>
      rows.reduce((acc: Record<string, any>, row) => {
        const key = row.l1DepositAddressY ?? 'unknown';
        if (!acc[key]) acc[key] = { address: row.l1DepositAddressY, alias: row.alias ?? auth.displayName, rows: [] as any[] };
        acc[key].rows.push(row);
        return acc;
      }, {}),
    [auth.displayName, rows]
  );
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
            <div className="tab-subtitle">Email</div>
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
                    <td>{e.stuck ? <button style={{ width: 'auto' }} onClick={() => void retryEvent(e.id)}>Retry</button> : '—'}</td>
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
            {isAliasRegistered ? <div className="tab-subtitle">✓ Your email is registered</div> : null}
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
            <div className="receive-setup-heading">Register email</div>
            <div className="receive-setup-explanation">
              Register your signed-in email with this account so incoming deposits can be routed to you.
            </div>
            <div className="receive-actions">
              <button className="receive-claim-btn" style={{ width: 'auto' }} onClick={() => void registerAlias()}>
                Register email
              </button>
            </div>
          </div>
        ) : (
          <div className="stack-md">
            <div className="form-row">
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

      {activeGroups.map(renderGroup)}

      {inactiveGroups.length > 0 ? (
        <div className="portal-inactive-toggle-wrap">
          <button
            className="portal-inactive-toggle"
            type="button"
            onClick={() => setShowInactiveAddresses((value) => !value)}
          >
            <span>{showInactiveAddresses ? 'Hide addresses with no activity' : 'Show all'}</span>
            <span className={`portal-inactive-chevron ${showInactiveAddresses ? 'open' : ''}`}>⌄</span>
          </button>
        </div>
      ) : null}

      {showInactiveAddresses ? inactiveGroups.map(renderGroup) : null}
    </div>
  );
}
