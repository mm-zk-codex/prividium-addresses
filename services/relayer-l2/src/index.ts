import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { FORWARDER_FACTORY_L1_ABI, ONE_WAY_VAULT_ABI, STEALTH_FORWARDER_L1_ABI, VAULT_FACTORY_ABI } from '@prividium-poc/types';
import { loadBridgeConfig } from '@prividium-poc/config';
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const pk = process.env.RELAYER_L2_PRIVATE_KEY;
const rpc = process.env.L2_RPC_URL ?? process.env.RPC_URL_PRIVIDIUM;
if (!pk || !rpc) throw new Error('RELAYER_L2_PRIVATE_KEY and L2_RPC_URL required');
const domain = process.env.SIWE_DOMAIN!;
const permissionsApiBaseUrl = process.env.PRIVIDIUM_API_BASE_URL!;

const transport = http(rpc, { fetchFn: authFetch });
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ transport, account: privateKeyToAccount(pk as `0x${string}`) });
const db = new Database(process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db'));
db.pragma('busy_timeout = 5000');
const bridgeConfig = loadBridgeConfig();
const tokenMap = Object.fromEntries(bridgeConfig.tokens.map((t) => [t.l1Address.toLowerCase(), t.l2Address]));
const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 5);
const baseDelaySeconds = Number(process.env.BASE_DELAY_SECONDS ?? 15);
const maxDelaySeconds = Number(process.env.MAX_DELAY_SECONDS ?? 900);
const forwarderFactoryL2 = getAddress(process.env.L2_FORWARDER_FACTORY ?? bridgeConfig.l1.forwarderFactory);

function computeNextAttemptAt(nowMs: number, attempts: number): number {
  const delaySec = Math.min(2 ** attempts * baseDelaySeconds, maxDelaySeconds);
  return nowMs + delaySec * 1000;
}

function markEventError(eventId: number, err: unknown) {
  const row = db.prepare('SELECT attempts FROM deposit_events WHERE id=?').get(eventId) as any;
  const attempts = Number(row?.attempts ?? 0) + 1;
  const now = Date.now();
  const stuck = attempts >= maxAttempts ? 1 : 0;
  const nextAttemptAt = stuck ? now : computeNextAttemptAt(now, attempts);
  db.prepare('UPDATE deposit_events SET status=?, error=?, attempts=?, nextAttemptAt=?, stuck=?, lastErrorAt=? WHERE id=?').run(stuck ? 'stuck' : 'l2_failed', String(err), attempts, nextAttemptAt, stuck, now, eventId);
}

async function ensureForwarderAndSweepYtoX(y: `0x${string}`, request: any, kind: 'ETH' | 'ERC20', l2Token?: `0x${string}` | null) {
  const code = await publicClient.getCode({ address: y });
  let deployTx: `0x${string}` | null = null;
  if (!code || code === '0x') {
    const refundRecipient = process.env.REFUND_RECIPIENT_L2 ?? request.recipientPrividiumAddress;
    deployTx = await walletClient.writeContract({
      chain: null,
      address: forwarderFactoryL2,
      abi: FORWARDER_FACTORY_L1_ABI,
      functionName: 'deploy',
      args: [request.saltY, bridgeConfig.l1.bridgehub, BigInt(bridgeConfig.l2.chainId), request.l2VaultAddressX, refundRecipient, bridgeConfig.l1.assetRouter, bridgeConfig.l1.nativeTokenVault]
    });
    await publicClient.waitForTransactionReceipt({ hash: deployTx });
  }

  const sweepTx = await walletClient.writeContract({
    chain: null,
    address: y,
    abi: STEALTH_FORWARDER_L1_ABI,
    functionName: kind === 'ETH' ? 'sweepETH' : 'sweepERC20',
    args: kind === 'ETH' ? [] : [getAddress(l2Token!)]
  });
  await publicClient.waitForTransactionReceipt({ hash: sweepTx });
  return { deployTx, sweepTx };
}

async function ensureVaultAndSweep(x: `0x${string}`, saltX: `0x${string}`, recipient: `0x${string}`, kind: 'ETH' | 'ERC20', token?: string | null) {
  const code = await publicClient.getCode({ address: x });
  let deployTx: `0x${string}` | null = null;
  if (!code || code === '0x') {
    deployTx = await walletClient.writeContract({ chain: null, address: bridgeConfig.l2.vaultFactory, abi: VAULT_FACTORY_ABI, functionName: 'deployVault', args: [saltX, recipient] });
    await publicClient.waitForTransactionReceipt({ hash: deployTx });
  }

  const sweepTx = await walletClient.writeContract({
    chain: null,
    address: x,
    abi: ONE_WAY_VAULT_ABI,
    functionName: kind === 'ETH' ? 'sweepETH' : 'sweepERC20',
    args: kind === 'ETH' ? [] : [getAddress(token!)]
  });
  await publicClient.waitForTransactionReceipt({ hash: sweepTx });
  return { deployTx, sweepTx };
}

async function processSubmittedEvent(event: any, request: any, recipient: `0x${string}`) {
  const y = getAddress(request.l1DepositAddressY);
  const x = getAddress(request.l2VaultAddressX);
  const kind = event.kind as 'ETH' | 'ERC20';
  const mapped = tokenMap[(event.l1TokenAddress ?? '').toLowerCase()] ?? event.l1TokenAddress;
  const l2Token = kind === 'ERC20' ? getAddress(mapped) : null;
  const yBal = kind === 'ETH'
    ? await publicClient.getBalance({ address: y })
    : ((await publicClient.readContract({ address: l2Token!, abi: erc20Abi, functionName: 'balanceOf', args: [y] })) as bigint);
  if (yBal === 0n) return;

  db.prepare('UPDATE deposit_events SET status=?, l2ArrivedAt=? WHERE id=?').run('l2_arrived', Date.now(), event.id);

  const yStep = await ensureForwarderAndSweepYtoX(y, request, kind, l2Token);
  if (yStep.deployTx) {
    db.prepare('UPDATE deposit_events SET status=?, l2DeployForwarderTxHash=? WHERE id=?').run('l2_forwarder_deployed', yStep.deployTx, event.id);
  }
  db.prepare('UPDATE deposit_events SET status=?, l2SweepYtoXTxHash=? WHERE id=?').run('l2_swept_y_to_x', yStep.sweepTx, event.id);

  const xBal = kind === 'ETH'
    ? await publicClient.getBalance({ address: x })
    : ((await publicClient.readContract({ address: l2Token!, abi: erc20Abi, functionName: 'balanceOf', args: [x] })) as bigint);
  if (xBal === 0n) {
    throw new Error('sweep Y->X executed but X has zero balance');
  }

  const { deployTx, sweepTx } = await ensureVaultAndSweep(x, request.saltX, recipient, kind, l2Token);
  if (deployTx) {
    db.prepare('UPDATE deposit_events SET status=?, l2DeployVaultTxHash=?, l2DeployTxHash=? WHERE id=?').run('l2_vault_deployed', deployTx, deployTx, event.id);
  }
  db.prepare('UPDATE deposit_events SET status=?, l2SweepXtoRTxHash=?, l2SweepTxHash=? WHERE id=?').run('credited', sweepTx, sweepTx, event.id);
  db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), request.trackingId);
}

async function tick() {
  const rows = db
    .prepare(`SELECT e.*, dr.saltY, dr.saltX, dr.l1DepositAddressY, dr.l2VaultAddressX, dr.trackingId, COALESCE(dr.recipientPrividiumAddress, a.recipientPrividiumAddress) AS recipientPrividiumAddress
      FROM deposit_events e
      JOIN deposit_requests dr ON dr.trackingId = e.trackingId
      JOIN aliases a ON a.aliasKey = dr.aliasKey
      WHERE (e.status='l1_bridging_submitted' OR e.status='l2_failed') AND e.stuck=0 AND e.nextAttemptAt<=?
      ORDER BY e.createdAt ASC LIMIT 30`)
    .all(Date.now()) as any[];

  for (const row of rows) {
    try {
      await processSubmittedEvent(row, row, row.recipientPrividiumAddress);
    } catch (e) {
      console.log(`Error processing submitted event ${row.id} for trackingId ${row.trackingId}:`, e);
      markEventError(row.id, e);
    }
  }
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
void tick();

async function authFetch(url: any, init = {}) {
  const serviceToken = await getServiceToken();

  const headers = {
    ...((init as any).headers || {}),
    Authorization: `Bearer ${serviceToken}`
  };

  const response = await fetch(url, { ...init, headers });

  return response;
}

let cached = { token: null, expiresAt: 0 };

export async function getServiceToken() {
  if (cached.token && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  const account = privateKeyToAccount(pk as any);
  console.log('requesting siwe from ', `${permissionsApiBaseUrl}/api/siwe-messages`);
  const msgRes = await fetch(`${permissionsApiBaseUrl}/api/siwe-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, domain })
  });
  if (!msgRes.ok) {
    console.log('Error: ', await msgRes.text());
    throw new Error('Failed to request SIWE message for service auth');
  }
  const { msg } = await msgRes.json();

  const signature = await account.signMessage({ message: msg });

  const loginRes = await fetch(`${permissionsApiBaseUrl}/api/auth/login/crypto-native`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, signature })
  });
  if (!loginRes.ok) throw new Error('Failed to login service account');
  const { token } = await loginRes.json();

  cached = { token, expiresAt: Date.now() + 5 * 60 * 1000 };
  return token;
}
