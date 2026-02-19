import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { FORWARDER_FACTORY_L1_ABI, STEALTH_FORWARDER_L1_ABI } from '@prividium-poc/types';
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config({ path: resolve(process.cwd(), '../../infra/.env') });

const pk = process.env.RELAYER_L1_PRIVATE_KEY ?? process.env.PRIVATE_KEY_RELAYER;
const rpc = process.env.L1_RPC_URL ?? process.env.RPC_URL_SEPOLIA;
if (!pk || !rpc) throw new Error('RELAYER_L1_PRIVATE_KEY and L1_RPC_URL required');

const cfg = JSON.parse(readFileSync(process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), '../../contracts/deployments/11155111.json'), 'utf8')) as any;
const db = new Database(process.env.SQLITE_PATH ?? resolve(process.cwd(), '../data/poc.db'));
const account = privateKeyToAccount(pk as `0x${string}`);
const publicClient = createPublicClient({ transport: http(rpc) });
const walletClient = createWalletClient({ transport: http(rpc), account });

const nativeTokenVaultAbi = parseAbi(['function assetId(address token) view returns (bytes32)']);

const defaultMintEth = BigInt(process.env.MINT_VALUE_WEI_ETH_DEFAULT ?? '2000000000000000');
const defaultMintErc20 = BigInt(process.env.MINT_VALUE_WEI_ERC20_DEFAULT ?? '3000000000000000');
const gasEth = BigInt(process.env.L2_GAS_LIMIT_ETH_DEFAULT ?? '700000');
const gasErc20 = BigInt(process.env.L2_GAS_LIMIT_ERC20_DEFAULT ?? '1200000');
const pubdata = BigInt(process.env.L2_GAS_PER_PUBDATA_DEFAULT ?? '800');

async function tick() {
  const rows = db
    .prepare("SELECT dr.*, a.recipientPrividiumAddress FROM deposit_requests dr JOIN aliases a ON a.aliasKey = dr.aliasKey WHERE dr.status IN ('issued','l1_detected','l1_forwarder_deployed') ORDER BY dr.issuedAt ASC LIMIT 20")
    .all() as any[];

  for (const row of rows) {
    try {
      const y = getAddress(row.l1DepositAddressY);
      const tokenType = row.tokenType as 'ETH' | 'ERC20';
      let detectedAmount = 0n;

      if (tokenType === 'ETH') detectedAmount = await publicClient.getBalance({ address: y });
      else if (row.l1TokenAddress) {
        detectedAmount = await publicClient.readContract({ address: getAddress(row.l1TokenAddress), abi: erc20Abi, functionName: 'balanceOf', args: [y] });
      }

      if (detectedAmount > 0n && row.status === 'issued') {
        db.prepare("UPDATE deposit_requests SET status='l1_detected', l1DetectedAt=?, amount=? WHERE trackingId=?").run(Date.now(), detectedAmount.toString(), row.trackingId);
      }
      if (detectedAmount === 0n && row.status === 'issued') continue;

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
        db.prepare("UPDATE deposit_requests SET status='l1_forwarder_deployed', l1DeployTxHash=? WHERE trackingId=?").run(deployTx, row.trackingId);
      }

      if (tokenType === 'ETH') {
        const amount = await publicClient.getBalance({ address: y });
        if (amount === 0n) continue;
        const sweepTx = await walletClient.writeContract({
          address: y,
          abi: STEALTH_FORWARDER_L1_ABI,
          functionName: 'sweepETH',
          args: [defaultMintEth, amount, gasEth, pubdata],
          value: defaultMintEth
        });
        await publicClient.waitForTransactionReceipt({ hash: sweepTx });
        db.prepare("UPDATE deposit_requests SET status='l1_bridging_submitted', l1BridgeTxHash=?, amount=? WHERE trackingId=?").run(
          sweepTx,
          amount.toString(),
          row.trackingId
        );
      } else if (row.l1TokenAddress) {
        const amount = await publicClient.readContract({
          address: getAddress(row.l1TokenAddress),
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [y]
        });
        if (amount === 0n) continue;

        const tokenAssetId = await publicClient.readContract({
          address: cfg.nativeTokenVault,
          abi: nativeTokenVaultAbi,
          functionName: 'assetId',
          args: [getAddress(row.l1TokenAddress)]
        });

        const sweepTx = await walletClient.writeContract({
          address: y,
          abi: STEALTH_FORWARDER_L1_ABI,
          functionName: 'sweepERC20',
          args: [getAddress(row.l1TokenAddress), amount, tokenAssetId, defaultMintErc20, gasErc20, pubdata],
          value: defaultMintErc20
        });
        await publicClient.waitForTransactionReceipt({ hash: sweepTx });
        db.prepare("UPDATE deposit_requests SET status='l1_bridging_submitted', l1BridgeTxHash=?, amount=? WHERE trackingId=?").run(
          sweepTx,
          amount.toString(),
          row.trackingId
        );
      }
    } catch (e) {
      db.prepare("UPDATE deposit_requests SET status='failed', error=? WHERE trackingId=?").run(String(e), row.trackingId);
    }
  }
}

setInterval(() => void tick(), Number(process.env.RELAYER_POLL_MS ?? 7000));
void tick();
