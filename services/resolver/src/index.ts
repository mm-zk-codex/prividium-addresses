import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { aliasKeyFromParts, computeSalt, parseEmailAndSuffix } from '@prividium-poc/types';
import { createPublicClient, getAddress, http } from 'viem';
import { openDb } from './db.js';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const app = express();
app.use(cors());
app.use(express.json());

const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db');
const deploymentsPath = process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json');
const db = openDb(sqlitePath);
const cfg = JSON.parse(readFileSync(deploymentsPath, 'utf8')) as any;

const l1Client = createPublicClient({ chain: undefined, transport: http(process.env.L1_RPC_URL ?? process.env.RPC_URL_SEPOLIA) });
const l2Client = createPublicClient({ chain: undefined, transport: http(process.env.L2_RPC_URL ?? process.env.RPC_URL_PRIVIDIUM) });

const forwarderFactoryAbi = [
  {
    type: 'function',
    name: 'computeAddress',
    stateMutability: 'view',
    inputs: [
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'address' },
      { type: 'address' },
      { type: 'address' }
    ],
    outputs: [{ type: 'address' }]
  }
] as const;

const vaultFactoryAbi = [
  {
    type: 'function',
    name: 'computeVaultAddress',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }, { type: 'address' }],
    outputs: [{ type: 'address' }]
  }
] as const;

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/alias/register', (req, res) => {
  const { email, suffix, recipientPrividiumAddress } = req.body as { email: string; suffix?: string; recipientPrividiumAddress: string };
  const parsed = parseEmailAndSuffix(email, suffix);
  const aliasKey = aliasKeyFromParts(parsed.normalizedEmail, parsed.suffix);

  db.prepare(
    `INSERT INTO aliases(aliasKey, normalizedEmail, suffix, recipientPrividiumAddress, createdAt)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(aliasKey) DO UPDATE SET recipientPrividiumAddress=excluded.recipientPrividiumAddress`
  ).run(aliasKey, parsed.normalizedEmail, parsed.suffix, getAddress(recipientPrividiumAddress), Date.now());

  res.json({ aliasKey, normalizedEmail: parsed.normalizedEmail, suffix: parsed.suffix });
});

app.post('/deposit/request', async (req, res) => {
  const { email, suffix, tokenType = 'ETH', l1TokenAddress = null, amount = null } = req.body as any;
  if (tokenType !== 'ETH' && tokenType !== 'ERC20') {
    return res.status(400).json({ error: 'tokenType must be ETH or ERC20' });
  }
  if (tokenType === 'ERC20' && !l1TokenAddress) {
    return res.status(400).json({ error: 'l1TokenAddress is required when tokenType is ERC20' });
  }
  const parsed = parseEmailAndSuffix(email, suffix);
  const aliasKey = aliasKeyFromParts(parsed.normalizedEmail, parsed.suffix);
  const alias = db.prepare('SELECT * FROM aliases WHERE aliasKey=?').get(aliasKey) as any;
  if (!alias) return res.status(404).json({ error: 'Alias not registered' });

  const trackingId = uuidv4();
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
  const saltX = computeSalt(aliasKey, nonce, 'X');
  const saltY = computeSalt(aliasKey, nonce, 'Y');
  const refundRecipient = process.env.REFUND_RECIPIENT_L2 ?? alias.recipientPrividiumAddress;

  const x = await l2Client.readContract({
    address: cfg.l2.vaultFactory,
    abi: vaultFactoryAbi,
    functionName: 'computeVaultAddress',
    args: [saltX, alias.recipientPrividiumAddress]
  });

  const y = await l1Client.readContract({
    address: cfg.l1.forwarderFactoryL1,
    abi: forwarderFactoryAbi,
    functionName: 'computeAddress',
    args: [
      saltY,
      cfg.l1.bridgehub,
      BigInt(cfg.l2.chainId),
      x,
      refundRecipient,
      cfg.assetRouter,
      cfg.nativeTokenVault
    ]
  });

  db.prepare(
    `INSERT INTO deposit_requests(trackingId, aliasKey, chainId, l1DepositAddressY, l2VaultAddressX, saltY, saltX, tokenType, l1TokenAddress, amount, status, issuedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?)`
  ).run(
    trackingId,
    aliasKey,
    cfg.l1.chainId,
    y,
    x,
    saltY,
    saltX,
    tokenType,
    l1TokenAddress ? getAddress(l1TokenAddress) : null,
    amount,
    Date.now()
  );

  res.json({ trackingId, l1DepositAddress: y, l2Destination: x, tokenType, chainId: cfg.l1.chainId });
});

app.get('/deposit/:trackingId', (req, res) => {
  const row = db.prepare('SELECT * FROM deposit_requests WHERE trackingId=?').get(req.params.trackingId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/alias/deposits', (req, res) => {
  const aliasKey = String(req.query.aliasKey ?? '');
  const rows = db.prepare('SELECT * FROM deposit_requests WHERE aliasKey = ? ORDER BY issuedAt DESC LIMIT 50').all(aliasKey);
  res.json(rows);
});

app.listen(Number(process.env.RESOLVER_PORT ?? 4000), () => console.log('resolver listening'));
