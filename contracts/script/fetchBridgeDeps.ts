import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';

const BRIDGEHUB_ABI = [
  {
    type: 'function',
    name: 'assetRouter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }]
  }
] as const;

const ASSET_ROUTER_ABI = [
  {
    type: 'function',
    name: 'nativeTokenVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }]
  }
] as const;

async function main() {
  const path = process.env.CONTRACTS_JSON_PATH ?? resolve(process.cwd(), 'deployments/11155111.json');
  const bridgehub = process.env.BRIDGEHUB_ADDRESS as `0x${string}`;
  if (!bridgehub) throw new Error('BRIDGEHUB_ADDRESS required');

  const { viem } = hre;
  const publicClient = await viem.getPublicClient();
  const assetRouter = await publicClient.readContract({ address: bridgehub, abi: BRIDGEHUB_ABI, functionName: 'assetRouter' });
  const nativeTokenVault = await publicClient.readContract({ address: assetRouter, abi: ASSET_ROUTER_ABI, functionName: 'nativeTokenVault' });

  const current = JSON.parse(readFileSync(path, 'utf8'));
  current.assetRouter = assetRouter;
  current.nativeTokenVault = nativeTokenVault;

  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(current, null, 2));
  console.log({ bridgehub, assetRouter, nativeTokenVault });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
