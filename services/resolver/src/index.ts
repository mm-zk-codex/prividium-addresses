import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { aliasKeyFromParts, computeSalt, normalizeEmail } from '@prividium-poc/types';
import { createPublicClient, getAddress, http } from 'viem';
import { openDb } from './db.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const app = express();
app.use(cors());
app.use(express.json());

const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db');
const deploymentsPath = process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json');
const supportedErc20Path = process.env.SUPPORTED_ERC20_JSON_PATH ?? resolve(process.cwd(), '../../infra/supported-erc20.json');
const prividiumApiBaseUrl = process.env.PRIVIDIUM_API_BASE_URL ?? '';
const db = openDb(sqlitePath);
const cfg = JSON.parse(readFileSync(deploymentsPath, 'utf8')) as any;
const supportedErc20 = JSON.parse(readFileSync(supportedErc20Path, 'utf8')) as Array<any>;

const l1Client = createPublicClient({ chain: undefined, transport: http(process.env.L1_RPC_URL ?? process.env.RPC_URL_SEPOLIA) });
const l2Client = createPublicClient({ chain: undefined, transport: http(process.env.L2_RPC_URL ?? process.env.RPC_URL_PRIVIDIUM) });

const forwarderFactoryAbi = [{ type: 'function', name: 'computeAddress', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }] as const;
const vaultFactoryAbi = [{ type: 'function', name: 'computeVaultAddress', stateMutability: 'view', inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [{ type: 'address' }] }] as const;

function extractBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

async function getAuthenticatedIdentity(req: express.Request): Promise<{ displayName: string }> {
  const token = extractBearerToken(req);
  if (!token || !prividiumApiBaseUrl) throw new Error('missing auth');

  const sessionResp = await fetch(`${prividiumApiBaseUrl}/api/auth/current-session`, { headers: { Authorization: `Bearer ${token}` } });
  if (!sessionResp.ok) throw new Error('invalid session');

  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as any;
  const displayName = payload?.displayName;
  if (!displayName || typeof displayName !== 'string') throw new Error('displayName missing in token');
  return { displayName };
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/supported-erc20', (_req, res) => res.json(supportedErc20));

app.post('/alias/register', async (req, res) => {
  try {
    if ('email' in (req.body ?? {})) return res.status(400).json({ error: 'email must not be provided' });
    const { suffix, recipientPrividiumAddress } = req.body as { suffix?: string; recipientPrividiumAddress: string };
    const { displayName } = await getAuthenticatedIdentity(req);
    const normalizedEmail = normalizeEmail(displayName);
    const normalizedSuffix = (suffix ?? '').trim().toLowerCase();
    const aliasKey = aliasKeyFromParts(normalizedEmail, normalizedSuffix);

    db.prepare(`INSERT INTO aliases(aliasKey, normalizedEmail, suffix, recipientPrividiumAddress, createdAt)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(aliasKey) DO UPDATE SET recipientPrividiumAddress=excluded.recipientPrividiumAddress`).run(
      aliasKey,
      normalizedEmail,
      normalizedSuffix,
      getAddress(recipientPrividiumAddress),
      Date.now()
    );

    res.json({ aliasKey, normalizedEmail, suffix: normalizedSuffix });
  } catch (e) {
    res.status(401).json({ error: String(e) });
  }
});

app.post('/deposit/request', async (req, res) => {
  const { email, suffix } = req.body as any;
  const normalizedEmail = normalizeEmail(String(email ?? ''));
  if (!normalizedEmail) return res.status(400).json({ error: 'email required' });
  const normalizedSuffix = (suffix ?? '').trim().toLowerCase();
  const aliasKey = aliasKeyFromParts(normalizedEmail, normalizedSuffix);
  const alias = db.prepare('SELECT * FROM aliases WHERE aliasKey=?').get(aliasKey) as any;
  if (!alias) return res.status(404).json({ error: 'Alias not registered' });

  const existing = db
    .prepare('SELECT * FROM deposit_requests WHERE aliasKey=? AND recipientPrividiumAddress=? ORDER BY createdAt DESC LIMIT 1')
    .get(aliasKey, alias.recipientPrividiumAddress) as any;
  if (existing) {
    return res.json({ trackingId: existing.trackingId, l1DepositAddress: existing.l1DepositAddressY, l2VaultAddress: existing.l2VaultAddressX });
  }

  const trackingId = uuidv4();
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const saltX = computeSalt(aliasKey, nonce, 'X');
  const saltY = computeSalt(aliasKey, nonce, 'Y');
  const refundRecipient = process.env.REFUND_RECIPIENT_L2 ?? alias.recipientPrividiumAddress;

  const x = await l2Client.readContract({ address: cfg.l2.vaultFactory, abi: vaultFactoryAbi, functionName: 'computeVaultAddress', args: [saltX, alias.recipientPrividiumAddress] });
  const y = await l1Client.readContract({
    address: cfg.l1.forwarderFactoryL1,
    abi: forwarderFactoryAbi,
    functionName: 'computeAddress',
    args: [saltY, cfg.l1.bridgehub, BigInt(cfg.l2.chainId), x, refundRecipient, cfg.assetRouter, cfg.nativeTokenVault]
  });

  const now = Date.now();
  db.prepare(`INSERT INTO deposit_requests(trackingId, aliasKey, recipientPrividiumAddress, l1DepositAddressY, l2VaultAddressX, saltY, saltX, createdAt, lastActivityAt, inflightL1, inflightL2, isActive)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1)`).run(trackingId, aliasKey, alias.recipientPrividiumAddress, y, x, saltY, saltX, now, now);

  res.json({ trackingId, l1DepositAddress: y, l2VaultAddress: x });
});

app.get('/deposit/:trackingId', (req, res) => {
  const request = db.prepare('SELECT * FROM deposit_requests WHERE trackingId=?').get(req.params.trackingId) as any;
  if (!request) return res.status(404).json({ error: 'Not found' });
  const events = db.prepare('SELECT * FROM deposit_events WHERE trackingId=? ORDER BY createdAt DESC LIMIT 50').all(req.params.trackingId);
  res.json({ request, events });
});

app.get('/alias/deposits', (req, res) => {
  const aliasKey = String(req.query.aliasKey ?? '');
  const rows = db.prepare('SELECT * FROM deposit_requests WHERE aliasKey = ? ORDER BY createdAt DESC LIMIT 50').all(aliasKey) as any[];
  const eventsStmt = db.prepare('SELECT * FROM deposit_events WHERE trackingId=? ORDER BY createdAt DESC LIMIT 10');
  res.json(rows.map((r) => ({ ...r, events: eventsStmt.all(r.trackingId) })));
});

app.listen(Number(process.env.RESOLVER_PORT ?? 4000), () => console.log('resolver listening'));
