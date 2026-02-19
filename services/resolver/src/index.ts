import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  DEFAULT_CHAIN_ID,
  aliasKeyFromParts,
  buildForwarderInitCode,
  computeSalt,
  parseEmailAndSuffix
} from '@prividium-poc/types';
import { getContractAddress, getAddress } from 'viem';
import { openDb } from './db.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const app = express();
app.use(cors());
app.use(express.json());

const chainId = Number(process.env.CHAIN_ID ?? DEFAULT_CHAIN_ID);
const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db');
const contractsPath = process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json');
const forwarderArtifactPath =
  process.env.FORWARDER_ARTIFACT_PATH ??
  resolve(process.cwd(), '../../contracts/artifacts/src/StealthForwarder.sol/StealthForwarder.json');

const db = openDb(sqlitePath);
const contractConfig = JSON.parse(readFileSync(contractsPath, 'utf8')) as { factory: string; adapter: string; chainId: number };
const forwarderArtifact = JSON.parse(readFileSync(forwarderArtifactPath, 'utf8')) as { bytecode: string };
const forwarderCreationCode = forwarderArtifact.bytecode;

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/config', (_req, res) =>
  res.json({ chainId, rpcUrl: process.env.RPC_URL_SEPOLIA ? '[redacted]' : '', factory: contractConfig.factory, adapter: contractConfig.adapter })
);

app.post('/alias/register', (req, res) => {
  const { email, suffix, recipientPrividiumAddress } = req.body as {
    email: string;
    suffix?: string;
    recipientPrividiumAddress: string;
  };
  const parsed = parseEmailAndSuffix(email, suffix);
  const aliasKey = aliasKeyFromParts(parsed.normalizedEmail, parsed.suffix);
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO aliases(aliasKey, normalizedEmail, suffix, recipientPrividiumAddress, createdAt)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(aliasKey) DO UPDATE SET recipientPrividiumAddress=excluded.recipientPrividiumAddress`
  ).run(aliasKey, parsed.normalizedEmail, parsed.suffix, getAddress(recipientPrividiumAddress), createdAt);
  res.json({ aliasKey, normalizedEmail: parsed.normalizedEmail, suffix: parsed.suffix });
});

app.post('/deposit/request', (req, res) => {
  const { email, suffix, chainId: requestedChainId } = req.body as { email: string; suffix?: string; chainId?: number };
  const targetChainId = requestedChainId ?? chainId;
  if (targetChainId !== chainId) return res.status(400).json({ error: `Only chainId ${chainId} is supported in Phase 1` });

  const parsed = parseEmailAndSuffix(email, suffix);
  const aliasKey = aliasKeyFromParts(parsed.normalizedEmail, parsed.suffix);
  const alias = db.prepare('SELECT * FROM aliases WHERE aliasKey = ?').get(aliasKey) as { recipientPrividiumAddress: string } | undefined;
  if (!alias) return res.status(404).json({ error: 'Alias not registered' });

  const trackingId = uuidv4();
  const requestNonce = `0x${randomBytes(32).toString('hex')}`;
  const salt = computeSalt(aliasKey, requestNonce);
  const initCode = buildForwarderInitCode(forwarderCreationCode, alias.recipientPrividiumAddress, contractConfig.adapter);
  const depositAddress = getContractAddress({ from: contractConfig.factory as `0x${string}`, salt, bytecode: initCode, opcode: 'CREATE2' });
  const issuedAt = Date.now();

  db.prepare(
    `INSERT INTO deposit_requests(trackingId, aliasKey, chainId, salt, depositAddress, status, issuedAt)
     VALUES(?, ?, ?, ?, ?, 'issued', ?)`
  ).run(trackingId, aliasKey, targetChainId, salt, depositAddress, issuedAt);

  res.json({
    trackingId,
    chainId: targetChainId,
    depositAddress,
    expiresAt: issuedAt + 86_400_000,
    factory: contractConfig.factory,
    adapter: contractConfig.adapter
  });
});

app.get('/deposit/:trackingId', (req, res) => {
  const row = db.prepare('SELECT * FROM deposit_requests WHERE trackingId = ?').get(req.params.trackingId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/alias/deposits', (req, res) => {
  const aliasKey = String(req.query.aliasKey ?? '');
  if (!aliasKey) return res.status(400).json({ error: 'aliasKey is required' });
  const rows = db
    .prepare('SELECT * FROM deposit_requests WHERE aliasKey = ? ORDER BY issuedAt DESC LIMIT 50')
    .all(aliasKey);
  res.json(rows);
});

const port = Number(process.env.RESOLVER_PORT ?? 4000);
app.listen(port, () => {
  console.log(`resolver listening on ${port}`);
});
