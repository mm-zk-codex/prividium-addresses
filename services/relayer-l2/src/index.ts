import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { ONE_WAY_VAULT_ABI, VAULT_FACTORY_ABI } from '@prividium-poc/types';
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const pk = process.env.RELAYER_L2_PRIVATE_KEY;
const rpc = process.env.L2_RPC_URL ?? process.env.RPC_URL_PRIVIDIUM;
if (!pk || !rpc) throw new Error('RELAYER_L2_PRIVATE_KEY and L2_RPC_URL required');

const jwt = process.env.PRIVIDIUM_JWT;
const transport = http(rpc, { fetchOptions: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined });
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ transport, account: privateKeyToAccount(pk as `0x${string}`) });
const db = new Database(process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db'));
const cfg = JSON.parse(readFileSync(process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json'), 'utf8')) as any;
const tokenMap = JSON.parse(process.env.L2_TOKEN_MAP_JSON ?? '{}') as Record<string, string>;

async function ensureVaultAndSweep(x: `0x${string}`, saltX: string, recipient: string, kind: 'ETH' | 'ERC20', token?: string | null) {
  const code = await publicClient.getCode({ address: x });
  let deployTx: `0x${string}` | null = null;
  if (!code || code === '0x') {
    deployTx = await walletClient.writeContract({ address: cfg.l2.vaultFactory, abi: VAULT_FACTORY_ABI, functionName: 'deployVault', args: [saltX, recipient] });
    await publicClient.waitForTransactionReceipt({ hash: deployTx });
  }

  const sweepTx = await walletClient.writeContract({
    address: x,
    abi: ONE_WAY_VAULT_ABI,
    functionName: kind === 'ETH' ? 'sweepETH' : 'sweepERC20',
    args: kind === 'ETH' ? [] : [getAddress(token!)]
  });
  await publicClient.waitForTransactionReceipt({ hash: sweepTx });
  return { deployTx, sweepTx };
}

async function processSubmittedEvent(event: any, request: any, recipient: string) {
  const x = getAddress(request.l2VaultAddressX);
  const kind = event.kind as 'ETH' | 'ERC20';
  const l2Token = kind === 'ERC20' ? getAddress(tokenMap[(event.l1TokenAddress ?? '').toLowerCase()] ?? event.l1TokenAddress) : null;
  const bal = kind === 'ETH' ? await publicClient.getBalance({ address: x }) : ((await publicClient.readContract({ address: l2Token!, abi: erc20Abi, functionName: 'balanceOf', args: [x] })) as bigint);
  if (bal === 0n) return;

  db.prepare('UPDATE deposit_events SET status=?, l2ArrivedAt=? WHERE id=?').run('l2_arrived', Date.now(), event.id);
  const { deployTx, sweepTx } = await ensureVaultAndSweep(x, request.saltX, recipient, kind, l2Token);
  if (deployTx) db.prepare('UPDATE deposit_events SET status=?, l2DeployTxHash=? WHERE id=?').run('l2_vault_deployed', deployTx, event.id);
  db.prepare('UPDATE deposit_events SET status=?, l2SweepTxHash=? WHERE id=?').run('credited', sweepTx, event.id);
  db.prepare('UPDATE deposit_requests SET lastActivityAt=? WHERE trackingId=?').run(Date.now(), request.trackingId);
}

async function reconcileRequest(request: any, recipient: string) {
  const x = getAddress(request.l2VaultAddressX);
  const ethBal = await publicClient.getBalance({ address: x });
  if (ethBal > 0n) {
    const eventId = Number(
      db.prepare('INSERT INTO deposit_events(trackingId,kind,amount,status,note,createdAt) VALUES(?,?,?,?,?,?)').run(request.trackingId, 'ETH', ethBal.toString(), 'l2_arrived', 'reconciled', Date.now()).lastInsertRowid
    );
    const { deployTx, sweepTx } = await ensureVaultAndSweep(x, request.saltX, recipient, 'ETH');
    db.prepare('UPDATE deposit_events SET status=?, l2DeployTxHash=?, l2SweepTxHash=? WHERE id=?').run('credited', deployTx, sweepTx, eventId);
  }

  for (const [l1Token, l2TokenRaw] of Object.entries(tokenMap)) {
    const l2Token = getAddress(l2TokenRaw);
    const bal = (await publicClient.readContract({ address: l2Token, abi: erc20Abi, functionName: 'balanceOf', args: [x] })) as bigint;
    if (bal === 0n) continue;
    const eventId = Number(
      db.prepare('INSERT INTO deposit_events(trackingId,kind,l1TokenAddress,amount,status,note,createdAt) VALUES(?,?,?,?,?,?,?)').run(request.trackingId, 'ERC20', l1Token, bal.toString(), 'l2_arrived', 'reconciled', Date.now()).lastInsertRowid
    );
    const { deployTx, sweepTx } = await ensureVaultAndSweep(x, request.saltX, recipient, 'ERC20', l2Token);
    db.prepare('UPDATE deposit_events SET status=?, l2DeployTxHash=?, l2SweepTxHash=? WHERE id=?').run('credited', deployTx, sweepTx, eventId);
  }
}

async function tick() {
  const rows = db
    .prepare(`SELECT e.*, dr.saltX, dr.l2VaultAddressX, dr.trackingId, a.recipientPrividiumAddress
      FROM deposit_events e
      JOIN deposit_requests dr ON dr.trackingId = e.trackingId
      JOIN aliases a ON a.aliasKey = dr.aliasKey
      WHERE e.status='l1_bridging_submitted'
      ORDER BY e.createdAt ASC LIMIT 30`)
    .all() as any[];

  for (const row of rows) {
    try {
      await processSubmittedEvent(row, row, row.recipientPrividiumAddress);
    } catch (e) {
      db.prepare('UPDATE deposit_events SET status=?, error=? WHERE id=?').run('failed', String(e), row.id);
    }
  }
}

async function safetyTick() {
  const rows = db.prepare('SELECT dr.*, a.recipientPrividiumAddress FROM deposit_requests dr JOIN aliases a ON a.aliasKey=dr.aliasKey WHERE dr.isActive=1').all() as any[];
  for (const row of rows) {
    try {
      await reconcileRequest(row, row.recipientPrividiumAddress);
    } catch {
      // noop
    }
  }
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
setInterval(() => void safetyTick(), Number(process.env.RELAYER_L2_SAFETY_SCAN_MS ?? 300000));
void tick();
void safetyTick();
