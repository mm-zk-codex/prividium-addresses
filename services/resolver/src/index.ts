import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { aliasKeyFromParts, computeSalt, normalizeEmail } from '@prividium-poc/types';
import { loadBridgeConfig } from '@prividium-poc/config';
import { createPublicClient, getAddress, http } from 'viem';
import { openDb } from './db.js';
import { evaluateAliasExists } from './alias.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const app = express();
app.use(cors());
app.use(express.json());

const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db');
const prividiumApiBaseUrl = process.env.PRIVIDIUM_API_BASE_URL ?? '';
const db = openDb(sqlitePath);
const bridgeConfig = loadBridgeConfig();

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

  const sessionResp = await fetch(`${prividiumApiBaseUrl}/api/profiles/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!sessionResp.ok) throw new Error('invalid session');

  const payload = (await sessionResp.json()) as any;
  const displayName = payload?.displayName;
  if (!displayName || typeof displayName !== 'string') throw new Error('displayName missing in token');
  return { displayName };
}

async function withAliasExistsDelay() {
  const ms = 100 + Math.floor(Math.random() * 150);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/accepted-tokens', (_req, res) => {
  res.json(bridgeConfig.tokens.map((t) => ({ symbol: t.symbol, name: t.name, decimals: t.decimals, l1Address: t.l1Address })));
});
app.get('/supported-erc20', (_req, res) => {
  res.json(bridgeConfig.tokens.map((t) => ({ symbol: t.symbol, name: t.name, decimals: t.decimals, l1Address: t.l1Address })));
});

app.post('/alias/exists', async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''));
  const suffix = String(req.body?.suffix ?? '').trim().toLowerCase();
  let result: 'match' | 'maybe_needs_suffix' | 'not_found' = 'not_found';

  if (email) {
    const hasBase = !!db.prepare('SELECT aliasKey FROM aliases WHERE normalizedEmail=? AND suffix=?').get(email, '');
    const hasSuffixed = !!db.prepare('SELECT aliasKey FROM aliases WHERE normalizedEmail=? AND suffix<>? LIMIT 1').get(email, '');
    const hasExact = suffix ? !!db.prepare('SELECT aliasKey FROM aliases WHERE aliasKey=?').get(aliasKeyFromParts(email, suffix)) : false;
    result = evaluateAliasExists(hasExact, hasBase, hasSuffixed, Boolean(suffix));
  }

  await withAliasExistsDelay();
  res.json({ result });
});

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
    console.log('error in /alias/register', e);
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

  const trackingId = uuidv4();
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const saltX = computeSalt(aliasKey, nonce, 'X');
  const saltY = computeSalt(aliasKey, nonce, 'Y');
  const refundRecipient = process.env.REFUND_RECIPIENT_L2 ?? alias.recipientPrividiumAddress;

  const x = await l2Client.readContract({ address: bridgeConfig.l2.vaultFactory as `0x${string}`, abi: vaultFactoryAbi, functionName: 'computeVaultAddress', args: [saltX, alias.recipientPrividiumAddress] });
  const y = await l1Client.readContract({
    address: bridgeConfig.l1.forwarderFactory as `0x${string}`,
    abi: forwarderFactoryAbi,
    functionName: 'computeAddress',
    args: [saltY, bridgeConfig.l1.bridgehub as `0x${string}`, BigInt(bridgeConfig.l2.chainId), x, refundRecipient, bridgeConfig.l1.assetRouter as `0x${string}`, bridgeConfig.l1.nativeTokenVault as `0x${string}`]
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

app.post('/deposit-events/:id/retry', async (req, res) => {
  try {
    const { displayName } = await getAuthenticatedIdentity(req);
    const eventId = Number(req.params.id);
    const event = db.prepare(`SELECT e.*, dr.aliasKey FROM deposit_events e JOIN deposit_requests dr ON dr.trackingId=e.trackingId WHERE e.id=?`).get(eventId) as any;
    if (!event) return res.status(404).json({ error: 'event not found' });

    const callerAliasKey = aliasKeyFromParts(normalizeEmail(displayName), String(req.body?.suffix ?? '').trim().toLowerCase());
    if (callerAliasKey !== event.aliasKey) return res.status(403).json({ error: 'forbidden' });

    db.prepare("UPDATE deposit_events SET stuck=0, attempts=0, nextAttemptAt=0, status='l1_bridging_submitted' WHERE id=?").run(eventId);
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({ error: String(e) });
  }
});

app.get('/alias/deposits', (req, res) => {
  const aliasKey = String(req.query.aliasKey ?? '');
  const rows = db.prepare('SELECT * FROM deposit_requests WHERE aliasKey = ? ORDER BY createdAt DESC LIMIT 50').all(aliasKey) as any[];
  const eventsStmt = db.prepare('SELECT * FROM deposit_events WHERE trackingId=? ORDER BY createdAt DESC LIMIT 10');
  res.json(rows.map((r) => ({ ...r, events: eventsStmt.all(r.trackingId) })));
});

app.listen(Number(process.env.RESOLVER_PORT ?? 4000), () => console.log('resolver listening'));
