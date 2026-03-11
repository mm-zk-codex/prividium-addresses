import { useEffect, useMemo, useState } from 'react';
import { createPrividiumClient } from 'prividium';
import { formatEther, isAddress, parseEther } from 'viem';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWalletClient } from 'wagmi';
import { usePrividiumAuth } from '../auth/PrividiumAuth';
import { prividiumChain, prividiumChainId, prividiumChainName } from '../app/prividiumChain';
import { shortAddress } from '../app/utils';

export function TransferPage() {
  const auth = usePrividiumAuth();
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const walletClient = useWalletClient();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0');
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState<string>();
  const [balanceValue, setBalanceValue] = useState<bigint | null>(null);

  const primaryConnector = connectors[0];
  const onExpectedChain = chainId === prividiumChainId;
  const hasWalletAndAuth = auth.isAuthenticated && isConnected;
  const hasMatchingPrividiumWallet = Boolean(
    address &&
      auth.walletAddresses.some(
        (walletAddress) => walletAddress.toLowerCase() === address.toLowerCase()
      )
  );
  const rpcClient = useMemo(
    () =>
      auth.isAuthenticated && address && hasMatchingPrividiumWallet
        ? createPrividiumClient({
            chain: prividiumChain,
            transport: auth.transport,
            account: address
          })
        : undefined,
    [address, auth.isAuthenticated, auth.transport, hasMatchingPrividiumWallet]
  );

  useEffect(() => {
    let isMounted = true;

    const syncBalance = async () => {
      if (!rpcClient || !address) {
        if (isMounted) setBalanceValue(null);
        return;
      }

      try {
        const nextBalance = await rpcClient.getBalance({ address });
        if (isMounted) setBalanceValue(nextBalance);
      } catch {
        if (isMounted) setBalanceValue(null);
      }
    };

    void syncBalance();
    const interval = window.setInterval(() => void syncBalance(), 5000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [address, rpcClient]);

  function handleMax() {
    if (balanceValue !== null) setAmount(formatEther(balanceValue));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setTxHash(undefined);

    if (!hasWalletAndAuth || !address) {
      setError('Log into Prividium and connect your wallet first.');
      return;
    }
    if (!hasMatchingPrividiumWallet) {
      setError('Connect a wallet that is associated with your Prividium account.');
      return;
    }
    if (!recipient || !isAddress(recipient)) {
      setError('Enter a valid recipient address.');
      return;
    }
    if (!amount || parseEther(amount) === 0n) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (balanceValue !== null && parseEther(amount) > balanceValue) {
      setError('Amount exceeds available balance.');
      return;
    }

    try {
      if (!onExpectedChain) {
        await switchChainAsync({ chainId: prividiumChainId });
      }
      if (!rpcClient) {
        throw new Error('Prividium RPC client is unavailable.');
      }
      if (!walletClient.data) {
        throw new Error('Wallet client is unavailable.');
      }
      const value = parseEther(amount);
      const nonce = await rpcClient.getTransactionCount({
        address,
        blockTag: 'pending'
      });
      const gas = await rpcClient.estimateGas({
        account: address,
        to: recipient as `0x${string}`,
        value
      });
      const gasPrice = await rpcClient.getGasPrice();
      await auth.authorizeTransaction({
        walletAddress: address,
        toAddress: recipient as `0x${string}`,
        nonce,
        value
      });
      const hash = await walletClient.data.sendTransaction({
        account: walletClient.data.account ?? address,
        to: recipient as `0x${string}`,
        value,
        nonce,
        gas,
        gasPrice,
        chain: prividiumChain
      });
      setTxHash(hash);
      const nextBalance = await rpcClient.getBalance({ address });
      setBalanceValue(nextBalance);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Transfer failed.');
    }
  }

  return (
    <div className="tab-content">
      <div className="card">
        <div className="tab-header">
          <div>
            <div className="tab-title">Prividium Transfer</div>
            <div className="tab-subtitle">Send ETH directly from your connected wallet.</div>
          </div>
        </div>

        {!auth.isAuthenticated ? (
          <div className="alert alert-info">Log into Prividium to use transfers.</div>
        ) : !isConnected ? (
          <div className="send-wallet-box">
            <div className="tab-subtitle">Connect your wallet to access the transfer form.</div>
            <div className="button-row">
              <button
                style={{ width: 'auto' }}
                onClick={() => primaryConnector && connect({ connector: primaryConnector })}
                disabled={!primaryConnector || isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect wallet'}
              </button>
            </div>
            {connectError ? <div className="alert alert-error">{connectError.message}</div> : null}
          </div>
        ) : !hasMatchingPrividiumWallet ? (
          <>
            <div className="aave-info">
              <div className="aave-info-row">
                <strong>Connected wallet</strong>
                <code>{address}</code>
              </div>
              <div className="aave-info-row">
                <strong>Prividium wallet</strong>
                <span>{auth.walletAddress ? shortAddress(auth.walletAddress) : '—'}</span>
              </div>
            </div>
            <div className="alert alert-error">
              Connect a wallet associated with this Prividium account to use transfers.
            </div>
            <div className="button-row">
              <button className="secondary-brand" type="button" style={{ width: 'auto' }} onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="aave-info">
              <div className="aave-info-row">
                <strong>Connected wallet</strong>
                <code>{address}</code>
              </div>
              <div className="aave-info-row">
                <strong>Network</strong>
                <span>{onExpectedChain ? prividiumChainName : `Wrong network (${chainId ?? 'unknown'})`}</span>
              </div>
              <div className="aave-info-row">
                <strong>Balance</strong>
                <span>{balanceValue !== null ? `${formatEther(balanceValue)} ETH` : '—'}</span>
              </div>
            </div>

            {onExpectedChain ? (
              <form onSubmit={(event) => void handleSubmit(event)}>
                <div className="form-group">
                  <label htmlFor="transfer-recipient">Recipient address</label>
                  <input
                    id="transfer-recipient"
                    type="text"
                    placeholder="0x..."
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                  />
                </div>

                <div className="form-group">
                  <div className="label-row">
                    <label htmlFor="transfer-amount">Amount</label>
                    <span className="max-link" onClick={walletClient.isPending ? undefined : handleMax} role="button" tabIndex={0}>
                      Max
                    </span>
                  </div>
                  <input
                    id="transfer-amount"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.01"
                    value={amount}
                    onChange={(event) => {
                      const nextAmount = event.target.value;
                      try {
                        if (balanceValue !== null && nextAmount && parseEther(nextAmount) > balanceValue) return;
                      } catch {
                        // Let invalid partial input remain in the field until submit validation runs.
                      }
                      setAmount(nextAmount);
                    }}
                  />
                  {balanceValue !== null ? (
                    <div className="subtle-copy">Available: {formatEther(balanceValue)} ETH</div>
                  ) : null}
                </div>

                <div className="button-row">
                  <button type="submit" style={{ width: 'auto' }} disabled={walletClient.isPending || balanceValue === null}>
                    {walletClient.isPending ? 'Sending...' : 'Transfer'}
                  </button>
                  <button className="secondary-brand" type="button" style={{ width: 'auto' }} onClick={() => disconnect()}>
                    Disconnect
                  </button>
                </div>
              </form>
            ) : (
              <div className="button-row">
                <button style={{ width: 'auto' }} onClick={() => void switchChainAsync({ chainId: prividiumChainId })} disabled={isSwitchingChain}>
                  {isSwitchingChain ? 'Switching...' : `Switch to ${prividiumChainName}`}
                </button>
              </div>
            )}

            {txHash ? (
              <div className="alert alert-success">
                <strong>Transfer submitted</strong>
                <div className="info-row">
                  <span className="info-label">Tx hash</span>
                  <span className="info-value"><code>{txHash}</code></span>
                </div>
              </div>
            ) : null}

            {error ? <div className="alert alert-error">{error}</div> : null}
          </>
        )}
      </div>

    </div>
  );
}
