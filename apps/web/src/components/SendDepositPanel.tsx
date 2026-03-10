import { useMemo, useState } from "react";
import { erc20Abi, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { l1ChainId, l1ChainName } from "../app/l1Chain";
import { formatBalanceValue } from "../app/utils";
import type { SupportedToken } from "../app/types";

function getParsedAmount(value: string, decimals: number) {
  if (!value.trim()) return null;
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

export function SendDepositPanel({
  acceptedTokens,
  depositAddress,
  trackingLink,
}: {
  acceptedTokens: SupportedToken[];
  depositAddress: string;
  trackingLink: string;
}) {
  const [selectedAsset, setSelectedAsset] = useState<string>("ETH");
  const [amount, setAmount] = useState("");
  const [txMessage, setTxMessage] = useState("");
  const { address, chainId, isConnected } = useAccount();
  const {
    connectors,
    connect,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const sendTransaction = useSendTransaction();
  const writeContract = useWriteContract();

  const selectedToken = useMemo(
    () =>
      acceptedTokens.find((token) => token.l1Address === selectedAsset) ?? null,
    [acceptedTokens, selectedAsset],
  );
  const comparisonToken = selectedToken ?? acceptedTokens[0] ?? null;
  const ethBalance = useBalance({
    address,
    chainId: l1ChainId,
    query: { enabled: Boolean(address) },
  });
  const tokenBalance = useReadContract({
    address: comparisonToken?.l1Address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: l1ChainId,
    query: { enabled: Boolean(address && comparisonToken?.l1Address) },
  });

  const primaryConnector = connectors[0];
  const onExpectedChain = chainId === l1ChainId;
  const isSubmitting =
    sendTransaction.isPending || writeContract.isPending || isSwitchingChain;
  const selectedDecimals = selectedToken?.decimals ?? 18;
  const selectedSymbol = selectedToken?.symbol ?? "ETH";
  const currentBalance = selectedToken
    ? typeof tokenBalance.data === "bigint"
      ? tokenBalance.data
      : null
    : (ethBalance.data?.value ?? null);
  const parsedAmount = getParsedAmount(amount, selectedDecimals);
  const exceedsBalance = Boolean(
    currentBalance !== null &&
    parsedAmount !== null &&
    parsedAmount > currentBalance,
  );

  const submitTransfer = async () => {
    if (!isConnected || !address) {
      setTxMessage("Connect a wallet before sending a deposit.");
      return;
    }
    if (!amount.trim()) {
      setTxMessage("Enter an amount to send.");
      return;
    }
    if (exceedsBalance) {
      setTxMessage(`Amount exceeds available ${selectedSymbol} balance.`);
      return;
    }
    try {
      setTxMessage("");
      if (!onExpectedChain) await switchChainAsync({ chainId: l1ChainId });
      if (selectedToken) {
        const parsedAmount = parseUnits(amount, selectedToken.decimals);
        const hash = await writeContract.writeContractAsync({
          address: selectedToken.l1Address as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [depositAddress as `0x${string}`, parsedAmount],
          chainId: l1ChainId,
        });
        setTxMessage(`Transfer submitted: ${hash}`);
        await Promise.all([ethBalance.refetch(), tokenBalance.refetch()]);
        return;
      }
      const hash = await sendTransaction.sendTransactionAsync({
        to: depositAddress as `0x${string}`,
        value: parseEther(amount),
        chainId: l1ChainId,
      });
      setTxMessage(`Transfer submitted: ${hash}`);
      await Promise.all([ethBalance.refetch(), tokenBalance.refetch()]);
    } catch (error) {
      setTxMessage(
        error instanceof Error ? error.message : "Unable to send transfer.",
      );
    }
  };

  return (
    <div className="send-deposit-panel">
      {!isConnected ? (
        <div className="send-wallet-box">
          <div className="tab-subtitle">
            Connect your L1 wallet to send directly to the deposit address from
            this page.
          </div>
          <div className="button-row">
            <button
              style={{ width: "auto" }}
              onClick={() =>
                primaryConnector && connect({ connector: primaryConnector })
              }
              disabled={!primaryConnector || isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect wallet"}
            </button>
          </div>
          {connectError ? (
            <div className="alert alert-error">{connectError.message}</div>
          ) : null}
        </div>
      ) : (
        <div className="stack-md">
          <div className="aave-info">
            <div className="aave-info-row">
              <strong>Connected wallet</strong>
              <code>{address}</code>
            </div>
            <div className="aave-info-row">
              <strong>Network</strong>
              <span>
                {onExpectedChain
                  ? l1ChainName
                  : `Wrong network (${chainId ?? "unknown"})`}
              </span>
            </div>
          </div>

          {onExpectedChain ? (
            <>
              <div className="form-group">
                <label htmlFor="send-deposit-asset">Asset</label>
                <div className="select-wrap">
                  <select
                    className="asset-select"
                    id="send-deposit-asset"
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                  >
                    <option value="ETH">ETH</option>
                    {acceptedTokens.map((token) => (
                      <option key={token.l1Address} value={token.l1Address}>
                        {token.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="send-deposit-amount">Amount</label>
                <input
                  id="send-deposit-amount"
                  placeholder={
                    selectedToken
                      ? `Amount in ${selectedToken.symbol}`
                      : "Amount in ETH"
                  }
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    const nextParsed = getParsedAmount(
                      nextValue,
                      selectedDecimals,
                    );
                    if (
                      currentBalance !== null &&
                      nextParsed !== null &&
                      nextParsed > currentBalance
                    )
                      return;
                    setAmount(nextValue);
                    if (txMessage.startsWith("Amount exceeds available"))
                      setTxMessage("");
                  }}
                />
                {currentBalance !== null ? (
                  <div className="subtle-copy">
                    Available:{" "}
                    {formatBalanceValue(currentBalance, selectedDecimals)}{" "}
                    {selectedSymbol}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="send-deposit-actions">
            {!onExpectedChain ? (
              <button
                style={{ width: "auto" }}
                onClick={() => void switchChainAsync({ chainId: l1ChainId })}
                disabled={isSwitchingChain}
              >
                {isSwitchingChain ? "Switching..." : `Switch to ${l1ChainName}`}
              </button>
            ) : null}
            {onExpectedChain ? (
              <>
                <button
                  style={{ width: "auto" }}
                  onClick={() => void submitTransfer()}
                  disabled={isSubmitting || exceedsBalance}
                >
                  {isSubmitting ? "Sending..." : "Send deposit"}
                </button>
                <button
                  className="secondary-brand"
                  style={{ width: "auto" }}
                  onClick={() => disconnect()}
                >
                  Disconnect
                </button>
              </>
            ) : null}
          </div>
          {txMessage ? (
            <div
              className={
                txMessage.startsWith("Transfer submitted:")
                  ? "alert alert-success"
                  : "alert alert-error"
              }
            >
              {txMessage}
            </div>
          ) : null}
        </div>
      )}

      {isConnected && (
        <div className="aave-info">
          <div className="aave-info-row">
            <strong>Tracking link</strong>
          </div>
          <div className="aave-info-row">
            <div className="inline-copy-row">
              <code className="send-alias-mono send-alias-link">
                {trackingLink}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
