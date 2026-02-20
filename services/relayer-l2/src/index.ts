import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { ONE_WAY_VAULT_ABI, VAULT_FACTORY_ABI } from '@prividium-poc/types';
import { loadBridgeConfig } from '@prividium-poc/config';
import { erc20Abi, getAddress, type Address, type PublicClient } from 'viem';
import { PrividiumTxSender } from './tx/prividiumTxSender.js';
import { SiweAuthManager } from './auth/siweAuth.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const pk = process.env.RELAYER_L2_PRIVATE_KEY as `0x${string}` | undefined;
const proxyRpcUrl = process.env.PRIVIDIUM_PROXY_RPC_URL ?? process.env.L2_RPC_URL ?? process.env.RPC_URL_PRIVIDIUM;
const authBaseUrl = process.env.PRIVIDIUM_AUTH_BASE_URL ?? process.env.PRIVIDIUM_API_BASE_URL;
const chainId = Number(process.env.SIWE_CHAIN_ID ?? process.env.L2_CHAIN_ID ?? 260);
const siweDomain = process.env.SIWE_DOMAIN ?? 'localhost:3000';

if (!pk || !proxyRpcUrl || !authBaseUrl) {
  throw new Error('RELAYER_L2_PRIVATE_KEY, PRIVIDIUM_PROXY_RPC_URL (or L2_RPC_URL), and PRIVIDIUM_AUTH_BASE_URL (or PRIVIDIUM_API_BASE_URL) are required');
}

const authManager = new SiweAuthManager({
  privateKey: pk,
  chainId,
  proxyRpcUrl,
  authBaseUrl,
  siweDomain,
  siweUri: process.env.SIWE_URI || undefined,
  siweStatement: process.env.SIWE_STATEMENT || undefined,
  siweResources: process.env.SIWE_RESOURCES ? process.env.SIWE_RESOURCES.split(",").map((x) => x.trim()).filter(Boolean) : undefined
});
const txSender = new PrividiumTxSender(authManager);

const db = new Database(process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db'));
db.pragma('busy_timeout = 5000');
const bridgeConfig = loadBridgeConfig();
const tokenMap = Object.fromEntries(bridgeConfig.tokens.map((t) => [t.l1Address.toLowerCase(), t.l2Address]));
const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 5);
const baseDelaySeconds = Number(process.env.BASE_DELAY_SECONDS ?? 15);
const maxDelaySeconds = Number(process.env.MAX_DELAY_SECONDS ?? 900);

function computeNextAttemptAt(nowMs: number, attempts: number): number {
  const delaySec = Math.min(2 ** attempts * baseDelaySeconds, maxDelaySeconds);
  return nowMs + delaySec * 1000;
}

function markEventError(eventId: number, err: unknown) {
  const row = db.prepare('SELECT attempts FROM deposit_events WHERE id=?').get(eventId) as any;
  const attempts = Number(row?.attempts ?? 0) + 1;
  const now = Date.now();
  const isAuthError = authManager.isAuthError(err);
  const stuck = attempts >= maxAttempts ? 1 : 0;
  const nextAttemptAt = isAuthError && !stuck ? now + 5_000 : stuck ? now : computeNextAttemptAt(now, attempts);
  db.prepare('UPDATE deposit_events SET status=?, error=?, attempts=?, nextAttemptAt=?, stuck=?, lastErrorAt=? WHERE id=?').run(stuck ? 'stuck' : 'l2_failed', String(err), attempts, nextAttemptAt, stuck, now, eventId);
}

async function ensureVaultAndSweep(publicClient: PublicClient, x: Address, saltX: `0x${string}`, recipient: Address, kind: 'ETH' | 'ERC20', token?: Address | null) {
  const code = await publicClient.getCode({ address: x });
  let deployTx: `0x${string}` | null = null;

  if (!code || code === '0x') {
    deployTx = await txSender.writeContractAuthorized({
      contractAddress: bridgeConfig.l2.vaultFactory,
      abi: VAULT_FACTORY_ABI,
      functionName: 'deployVault',
      args: [saltX, recipient]
    });
    await publicClient.waitForTransactionReceipt({ hash: deployTx });
  }

  const sweepTx = await txSender.writeContractAuthorized({
    contractAddress: x,
    abi: ONE_WAY_VAULT_ABI,
    functionName: kind === 'ETH' ? 'sweepETH' : 'sweepERC20',
    args: kind === 'ETH' ? [] : [getAddress(token!)]
  });
  await publicClient.waitForTransactionReceipt({ hash: sweepTx });

  return { deployTx, sweepTx };
}

async function processSubmittedEvent(event: any, request: any, recipient: Address) {
  const x = getAddress(request.l2VaultAddressX);
  const kind = event.kind as 'ETH' | 'ERC20';
  const l2Token = kind === 'ERC20' ? getAddress(tokenMap[(event.l1TokenAddress ?? '').toLowerCase()] ?? event.l1TokenAddress) : null;

  await authManager.withAuthRetry(async ({ publicClient }) => {
    const bal = kind === 'ETH'
      ? await publicClient.getBalance({ address: x })
      : ((await publicClient.readContract({ address: l2Token!, abi: erc20Abi, functionName: 'balanceOf', args: [x] })) as bigint);
    if (bal === 0n) return;

    db.prepare('UPDATE deposit_events SET status=?, l2ArrivedAt=? WHERE id=?').run('l2_arrived', Date.now(), event.id);

    const { deployTx, sweepTx } = await ensureVaultAndSweep(publicClient, x, request.saltX, recipient, kind, l2Token);
    if (deployTx) db.prepare('UPDATE deposit_events SET status=?, l2DeployTxHash=? WHERE id=?').run('l2_vault_deployed', deployTx, event.id);
    db.prepare('UPDATE deposit_events SET status=?, l2SweepTxHash=? WHERE id=?').run('credited', sweepTx, event.id);
    db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), request.trackingId);
  });
}

async function tick() {
  const rows = db
    .prepare(`SELECT e.*, dr.saltX, dr.l2VaultAddressX, dr.trackingId, COALESCE(dr.recipientPrividiumAddress, a.recipientPrividiumAddress) AS recipientPrividiumAddress
      FROM deposit_events e
      JOIN deposit_requests dr ON dr.trackingId = e.trackingId
      JOIN aliases a ON a.aliasKey = dr.aliasKey
      WHERE (e.status='l1_bridging_submitted' OR e.status='l2_failed') AND e.stuck=0 AND e.nextAttemptAt<=?
      ORDER BY e.createdAt ASC LIMIT 30`)
    .all(Date.now()) as any[];

  for (const row of rows) {
    try {
      await processSubmittedEvent(row, row, getAddress(row.recipientPrividiumAddress));
    } catch (e) {
      console.log(`Error processing submitted event ${row.id} for trackingId ${row.trackingId}:`, e);
      markEventError(row.id, e);
    }
  }
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
void tick();
