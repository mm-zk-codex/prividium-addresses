import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { FACTORY_ABI, FORWARDER_ABI } from '@prividium-poc/types';
import { createPublicClient, createWalletClient, encodePacked, http } from 'viem';
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const rpcUrl = process.env.RPC_URL_SEPOLIA;
const pk = process.env.PRIVATE_KEY_RELAYER;
if (!rpcUrl || !pk) throw new Error('RPC_URL_SEPOLIA and PRIVATE_KEY_RELAYER required');

const sqlitePath = process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db');
const contractsPath = process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json');
const cfg = JSON.parse(readFileSync(contractsPath, 'utf8')) as { factory: `0x${string}`; adapter: `0x${string}` };

const db = new Database(sqlitePath);
const account = privateKeyToAccount(pk as `0x${string}`);

export const mySepolia = {
  ...sepolia,
  id: 31337,
  //id: process.env.CHAIN_ID || "31337", // your custom chain id
}

const publicClient = createPublicClient({ chain: mySepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ chain: mySepolia, transport: http(rpcUrl), account });

const aliasRecipientStmt = db.prepare('SELECT recipientPrividiumAddress FROM aliases WHERE aliasKey = ?');

function now() {
  return Date.now();
}

async function tick() {
  const rows = db
    .prepare("SELECT * FROM deposit_requests WHERE status IN ('issued','detected','deployed') ORDER BY issuedAt ASC LIMIT 25")
    .all() as Array<any>;

  for (const row of rows) {
    try {
      const recipientRow = aliasRecipientStmt.get(row.aliasKey) as { recipientPrividiumAddress: string } | undefined;
      if (!recipientRow) {
        db.prepare("UPDATE deposit_requests SET status='failed', error=? WHERE trackingId=?").run('missing alias', row.trackingId);
        continue;
      }

      const balance = await publicClient.getBalance({ address: row.depositAddress });
      if (balance === 0n && row.status === 'issued') continue;

      if (row.status === 'issued' && balance > 0n) {
        console.log(`[${row.trackingId}] detected ${balance}`);
        db.prepare("UPDATE deposit_requests SET status='detected', detectedAt=?, amountWei=? WHERE trackingId=?").run(
          now(),
          balance.toString(),
          row.trackingId
        );
      }

      const code = await publicClient.getCode({ address: row.depositAddress });
      if (!code || code === '0x') {
        const deployHash = await walletClient.writeContract({
          address: cfg.factory,
          abi: FACTORY_ABI,
          functionName: 'deploy',
          args: [row.salt, recipientRow.recipientPrividiumAddress, cfg.adapter]
        });
        await publicClient.waitForTransactionReceipt({ hash: deployHash });
        db.prepare("UPDATE deposit_requests SET status='deployed', deployedAt=?, deployTxHash=? WHERE trackingId=?").run(
          now(),
          deployHash,
          row.trackingId
        );
      }

      const forwarderBalance = await publicClient.getBalance({ address: row.depositAddress });
      if (forwarderBalance === 0n) continue;

      const metadata = encodePacked(['string'], [row.trackingId]);
      const sweepHash = await walletClient.writeContract({
        address: row.depositAddress,
        abi: FORWARDER_ABI,
        functionName: 'sweepNative',
        args: [metadata]
      });
      await publicClient.waitForTransactionReceipt({ hash: sweepHash });

      db.prepare(
        "UPDATE deposit_requests SET status='credited', sweptAt=?, creditedAt=?, sweepTxHash=?, amountWei=? WHERE trackingId=?"
      ).run(now(), now(), sweepHash, forwarderBalance.toString(), row.trackingId);
      console.log(`[${row.trackingId}] swept ${forwarderBalance} tx=${sweepHash}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.prepare("UPDATE deposit_requests SET status='failed', error=? WHERE trackingId=?").run(message, row.trackingId);
      console.error(`[${row.trackingId}] failed`, message);
    }
  }
}

setInterval(() => {
  void tick();
}, Number(process.env.RELAYER_POLL_MS ?? 5000));

console.log('relayer started');
void tick();
