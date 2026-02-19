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

async function tick() {
  const rows = db
    .prepare("SELECT dr.*, a.recipientPrividiumAddress FROM deposit_requests dr JOIN aliases a ON a.aliasKey=dr.aliasKey WHERE status IN ('l1_bridging_submitted','l2_arrived','l2_vault_deployed') ORDER BY issuedAt ASC LIMIT 20")
    .all() as any[];

  for (const row of rows) {
    try {
      const x = getAddress(row.l2VaultAddressX);
      let arrived = false;
      if (row.tokenType === 'ETH') {
        arrived = (await publicClient.getBalance({ address: x })) > 0n;
      } else if (row.l1TokenAddress) {
        // For phase-2 PoC, assume mirrored token address on L2 configured in env when ERC20 flow is used.
        const l2TokenAddress = getAddress(process.env.L2_ERC20_TOKEN_ADDRESS ?? row.l1TokenAddress);
        arrived = (await publicClient.readContract({ address: l2TokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [x] })) > 0n;
      }
      if (arrived && row.status === 'l1_bridging_submitted') {
        db.prepare("UPDATE deposit_requests SET status='l2_arrived', l2DetectedAt=? WHERE trackingId=?").run(Date.now(), row.trackingId);
      }
      if (!arrived && row.status === 'l1_bridging_submitted') continue;

      const code = await publicClient.getCode({ address: x });
      if (!code || code === '0x') {
        const deployTx = await walletClient.writeContract({
          address: cfg.l2.vaultFactory,
          abi: VAULT_FACTORY_ABI,
          functionName: 'deployVault',
          args: [row.saltX, row.recipientPrividiumAddress]
        });
        await publicClient.waitForTransactionReceipt({ hash: deployTx });
        db.prepare("UPDATE deposit_requests SET status='l2_vault_deployed', l2DeployTxHash=? WHERE trackingId=?").run(deployTx, row.trackingId);
      }

      const sweepTx = await walletClient.writeContract({
        address: x,
        abi: ONE_WAY_VAULT_ABI,
        functionName: row.tokenType === 'ETH' ? 'sweepETH' : 'sweepERC20',
        args: row.tokenType === 'ETH' ? [] : [getAddress(process.env.L2_ERC20_TOKEN_ADDRESS ?? row.l1TokenAddress)]
      });
      await publicClient.waitForTransactionReceipt({ hash: sweepTx });
      db.prepare("UPDATE deposit_requests SET status='credited', l2SweepTxHash=?, creditedAt=? WHERE trackingId=?").run(
        sweepTx,
        Date.now(),
        row.trackingId
      );
    } catch (e) {
      db.prepare("UPDATE deposit_requests SET status='failed', error=? WHERE trackingId=?").run(String(e), row.trackingId);
    }
  }
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
void tick();
