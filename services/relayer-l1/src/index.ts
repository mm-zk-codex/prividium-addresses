import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { FORWARDER_FACTORY_L1_ABI, STEALTH_FORWARDER_L1_ABI } from '@prividium-poc/types';
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { loadSupportedTokens, toTokenAllowlist, tryAcquireInflight } from './lib.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });
const pk = process.env.RELAYER_L1_PRIVATE_KEY ?? process.env.PRIVATE_KEY_RELAYER;
const rpc = process.env.L1_RPC_URL ?? process.env.RPC_URL_SEPOLIA;
if (!pk || !rpc) throw new Error('RELAYER_L1_PRIVATE_KEY and L1_RPC_URL required');

const cfg = JSON.parse(readFileSync(process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json'), 'utf8')) as any;
const db = new Database(process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db'));
const supportedPath = process.env.SUPPORTED_ERC20_JSON_PATH ?? resolve(process.cwd(), '../../infra/supported-erc20.json');
const supportedTokens = loadSupportedTokens(supportedPath);
const tokenAllowlist = toTokenAllowlist(supportedTokens);
const account = privateKeyToAccount(pk as `0x${string}`);
const publicClient = createPublicClient({ transport: http(rpc) });
const walletClient = createWalletClient({ transport: http(rpc), account });

const nativeTokenVaultAbi = parseAbi([
  'function assetId(address token) view returns (bytes32)',
  'function tokenAddress(bytes32 tokenAssetId) view returns (address)',
  'function ensureTokenIsRegistered(address token) returns (bytes32)'
]);

const defaultMintEth = BigInt(process.env.MINT_VALUE_WEI_ETH_DEFAULT ?? '2000000000000000');
const defaultMintErc20 = BigInt(process.env.MINT_VALUE_WEI_ERC20_DEFAULT ?? '3000000000000000');
const gasErc20 = BigInt(process.env.L2_GAS_LIMIT_ERC20_DEFAULT ?? '1200000');
const pubdata = BigInt(process.env.L2_GAS_PER_PUBDATA_DEFAULT ?? '800');

function createEvent(trackingId: string, kind: 'ETH' | 'ERC20', amount: bigint, token?: string | null) {
  const now = Date.now();
  const result = db
    .prepare('INSERT INTO deposit_events(trackingId, kind, l1TokenAddress, amount, status, detectedAtL1, createdAt) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(trackingId, kind, token ?? null, amount.toString(), 'detected_l1', now, now);
  return Number(result.lastInsertRowid);
}

function updateEvent(eventId: number, status: string, fields: Record<string, any> = {}) {
  const keys = Object.keys(fields);
  const set = ['status=?', ...keys.map((k) => `${k}=?`)].join(', ');
  db.prepare(`UPDATE deposit_events SET ${set} WHERE id=?`).run(status, ...keys.map((k) => fields[k]), eventId);
}

async function withMintRetry<T>(fn: (mint: bigint) => Promise<T>, base: bigint): Promise<T> {
  let mint = base;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn(mint);
    } catch (e) {
      if (i === 2) throw e;
      mint = (mint * 3n) / 2n;
    }
  }
  throw new Error('unreachable');
}

async function getOrRegisterAssetId(l1Token: `0x${string}`): Promise<`0x${string}`> {
  const cached = db.prepare('SELECT tokenAssetId FROM token_registry_cache WHERE l1TokenAddress=?').get(l1Token.toLowerCase()) as any;
  if (cached?.tokenAssetId) return cached.tokenAssetId;

  let tokenAssetId = (await publicClient.readContract({ address: cfg.nativeTokenVault, abi: nativeTokenVaultAbi, functionName: 'assetId', args: [l1Token] })) as `0x${string}`;
  const mapped = await publicClient.readContract({ address: cfg.nativeTokenVault, abi: nativeTokenVaultAbi, functionName: 'tokenAddress', args: [tokenAssetId] });
  if (mapped === '0x0000000000000000000000000000000000000000') {
    const tx = await walletClient.writeContract({ address: cfg.nativeTokenVault, abi: nativeTokenVaultAbi, functionName: 'ensureTokenIsRegistered', args: [l1Token] });
    await publicClient.waitForTransactionReceipt({ hash: tx });
    tokenAssetId = (await publicClient.readContract({ address: cfg.nativeTokenVault, abi: nativeTokenVaultAbi, functionName: 'assetId', args: [l1Token] })) as `0x${string}`;
  }
  db.prepare('INSERT OR REPLACE INTO token_registry_cache(l1TokenAddress, tokenAssetId, registeredAt) VALUES(?, ?, ?)').run(l1Token.toLowerCase(), tokenAssetId, Date.now());
  return tokenAssetId;
}

async function processDeposit(row: any) {
  if (!tryAcquireInflight(Number(row.inflightL1 ?? 0))) return;

  const lock = db.prepare('UPDATE deposit_requests SET inflightL1=1 WHERE trackingId=? AND inflightL1=0').run(row.trackingId);
  if (lock.changes === 0) return;

  let eventId = 0;
  try {
    const y = getAddress(row.l1DepositAddressY);
    const code = await publicClient.getCode({ address: y });
    if (!code || code === '0x') {
      const refundRecipient = process.env.REFUND_RECIPIENT_L2 ?? row.recipientPrividiumAddress;
      const deployTx = await walletClient.writeContract({
        address: cfg.l1.forwarderFactoryL1,
        abi: FORWARDER_FACTORY_L1_ABI,
        functionName: 'deploy',
        args: [row.saltY, cfg.l1.bridgehub, BigInt(cfg.l2.chainId), row.l2VaultAddressX, refundRecipient, cfg.assetRouter, cfg.nativeTokenVault]
      });
      await publicClient.waitForTransactionReceipt({ hash: deployTx });
      db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), row.trackingId);
      eventId = createEvent(row.trackingId, 'ETH', 0n);
      updateEvent(eventId, 'l1_forwarder_deployed', { l1DeployTxHash: deployTx });
    }

    const ethBal = await publicClient.getBalance({ address: y });
    if (ethBal > 0n) {
      eventId = createEvent(row.trackingId, 'ETH', ethBal);
      const sweepTx = await withMintRetry((mint) => walletClient.writeContract({ address: y, abi: STEALTH_FORWARDER_L1_ABI, functionName: 'sweepETH', args: [], value: mint }), defaultMintEth);
      await publicClient.waitForTransactionReceipt({ hash: sweepTx });
      updateEvent(eventId, 'l1_bridging_submitted', { l1BridgeTxHash: sweepTx });
      db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), row.trackingId);
      return;
    }

    for (const token of supportedTokens) {
      const tokenAddr = getAddress(token.l1Address);
      if (!tokenAllowlist.has(tokenAddr.toLowerCase())) continue;
      const bal = (await publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'balanceOf', args: [y] })) as bigint;
      if (bal === 0n) continue;
      eventId = createEvent(row.trackingId, 'ERC20', bal, tokenAddr);
      const tokenAssetId = await getOrRegisterAssetId(tokenAddr);
      const sweepTx = await withMintRetry(
        (mint) =>
          walletClient.writeContract({
            address: y,
            abi: STEALTH_FORWARDER_L1_ABI,
            functionName: 'sweepERC20',
            args: [tokenAddr, bal, tokenAssetId, mint, gasErc20, pubdata],
            value: mint
          }),
        defaultMintErc20
      );
      await publicClient.waitForTransactionReceipt({ hash: sweepTx });
      updateEvent(eventId, 'l1_bridging_submitted', { l1BridgeTxHash: sweepTx });
      db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), row.trackingId);
      return;
    }
  } catch (e) {
    console.log(`Error processing deposit for trackingId ${row.trackingId}:`, e);
    if (eventId) updateEvent(eventId, 'failed', { error: String(e) });
  } finally {
    db.prepare('UPDATE deposit_requests SET inflightL1=0 WHERE trackingId=?').run(row.trackingId);
  }
}

async function tick() {
  const rows = db
    .prepare('SELECT dr.*, COALESCE(dr.recipientPrividiumAddress, a.recipientPrividiumAddress) AS recipientPrividiumAddress FROM deposit_requests dr JOIN aliases a ON a.aliasKey = dr.aliasKey WHERE dr.isActive = 1 ORDER BY dr.lastActivityAt ASC LIMIT 30')
    .all() as any[];
  for (const row of rows) await processDeposit(row);
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
void tick();
