import { useEffect, useMemo, useState } from 'react';
import type { AliasResult, SendDepositTab, SupportedToken } from '../app/types';
import { TRACKING_COOKIE } from '../app/constants';
import { clearCookie, formatBalanceValue, getCookie, normalizeStatus, setCookie, shortAddress } from '../app/utils';
import { CopyIconButton } from '../components/CopyIconButton';
import { SendDepositPanel } from '../components/SendDepositPanel';

export function SendPage({ resolver }: { resolver: string }) {
  const [email, setEmail] = useState('');
  const [suffix, setSuffix] = useState('');
  const [message, setMessage] = useState('');
  const [req, setReq] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [acceptedTokens, setAcceptedTokens] = useState<SupportedToken[]>([]);
  const [lastPayload, setLastPayload] = useState<{ email: string; suffix?: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>();
  const [depositTab, setDepositTab] = useState<SendDepositTab>('details');

  const trackingId = req?.trackingId;
  const trackingLink = useMemo(() => (trackingId ? `${window.location.origin}/send?trackingId=${trackingId}` : ''), [trackingId]);
  const events = status?.events ?? [];
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

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? undefined : prev)), 2000);
  }

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
    setLastPayload(payload);
    setReq(data);
    setDepositTab('details');
    setStatus(null);
    setCookie(TRACKING_COOKIE, data.trackingId);
  };

  const continueFlow = async () => {
    setMessage('');
    const existsResp = await fetch(`${resolver}/alias/exists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, suffix: suffix || undefined })
    });
    const existsData = (await existsResp.json()) as { result: AliasResult };
    if (existsData.result === 'match') {
      await requestDeposit({ email, suffix: suffix || undefined });
      return;
    }
    if (existsData.result === 'maybe_needs_suffix') {
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
    setMessage('Enter recipient details and continue to generate a new address.');
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
  }, [resolver]);

  useEffect(() => {
    if (!trackingId) return;
    const it = setInterval(async () => {
      await loadTracking(trackingId);
    }, 2500);
    return () => clearInterval(it);
  }, [trackingId, resolver]);

  return (
    <div className="tab-content">
      <div className="card">
        <div className="tab-header">
          <div>
            <div className="tab-title">Prividium Send</div>
            <div className="tab-subtitle">Send ETH or supported ERC20 tokens to one deposit address. We handle the rest.</div>
          </div>
        </div>

        <div className="form-group">
          <input placeholder="recipient email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-group">
          <input placeholder="optional suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
        </div>
        <button style={{ width: 'auto' }} onClick={() => void continueFlow()}>Continue</button>
        {message ? <div className="alert alert-info">{message}</div> : null}

        <div className="subsection-title">Supported tokens</div>
        <div className="sidebar-list">
          {acceptedTokens.map((t) => (
            <div key={t.l1Address} className="sidebar-token">
              <div className="sidebar-token-symbol">{t.symbol}</div>
              <div className="sidebar-token-name">{t.name}</div>
              <code className="mono-block" style={{ marginTop: 8 }}>{t.l1Address}</code>
            </div>
          ))}
        </div>
      </div>

      {req ? (
        <>
          <div className="card">
            <div className="send-card-toggle" role="tablist" aria-label="Deposit actions">
              <button
                className={`send-card-toggle-btn ${depositTab === 'details' ? 'active' : ''}`}
                onClick={() => setDepositTab('details')}
              >
                Get deposit details
              </button>
              <button
                className={`send-card-toggle-btn ${depositTab === 'send' ? 'active' : ''}`}
                onClick={() => setDepositTab('send')}
              >
                Send deposit
              </button>
            </div>

            {depositTab === 'details' ? (
              <>
                <div className="aave-info">
                  <div className="aave-info-row">
                    <strong>Deposit address</strong>
                  </div>
                  <div className="aave-info-row">
                    <div className="inline-copy-row">
                      <code className="send-alias-mono">{req.l1DepositAddress}</code>
                      <CopyIconButton
                        label="Copy address"
                        copied={copiedKey === 'send-deposit-address'}
                        onClick={() => void copyText(req.l1DepositAddress, 'send-deposit-address')}
                      />
                    </div>
                  </div>
                  <div className="aave-info-row">
                    <strong>Tracking link</strong>
                  </div>
                  <div className="aave-info-row">
                    <div className="inline-copy-row">
                      <code className="send-alias-mono send-alias-link">{trackingLink}</code>
                      <CopyIconButton
                        label="Copy tracking link"
                        copied={copiedKey === 'send-tracking-link'}
                        onClick={() => void copyText(trackingLink, 'send-tracking-link')}
                      />
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button style={{ width: 'auto' }} onClick={() => void generateNewAddress()}>Generate new address</button>
                </div>

                <div className="aave-info" style={{ alignItems: 'center', marginTop: 16 }}>
                  <img
                    className="bg-white inline-block p-2 rounded"
                    width={160}
                    height={160}
                    alt="Deposit address QR"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`ethereum:${req.l1DepositAddress}`)}`}
                  />
                  <div className="tab-subtitle">Scan QR to pay from your wallet.</div>
                  <div className="tab-subtitle">Details: tracking ID {req.trackingId}</div>
                </div>
              </>
            ) : (
              <SendDepositPanel
                acceptedTokens={acceptedTokens}
                depositAddress={req.l1DepositAddress}
                trackingLink={trackingLink}
              />
            )}
          </div>

          <div className="card">
            <h3 className="tab-subtitle">Deposit history</h3>
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="tx-empty">No events yet.</td>
                  </tr>
                ) : (
                  events.map((e: any) => (
                    <tr key={e.id}>
                      <td>{getAssetLabel(e)}</td>
                      <td>{getFormattedAmount(e)}</td>
                      <td><span className={`status-chip ${e.stuck ? 'status-chip--error' : 'status-chip--pending'}`}>{normalizeStatus(e.status)}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
