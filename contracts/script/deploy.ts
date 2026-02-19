import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';

async function main() {
  const bridgehub = process.env.BRIDGEHUB_ADDRESS as `0x${string}` | undefined;
  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? 0);

  const { viem, network } = hre;
  const forwarderFactoryL1 = await viem.deployContract('ForwarderFactoryL1');
  const vaultFactory = await viem.deployContract('VaultFactory');

  const payload = {
    l1: {
      chainId: Number(network.config.chainId ?? 11155111),
      forwarderFactoryL1: forwarderFactoryL1.address,
      bridgehub: bridgehub ?? '0x0000000000000000000000000000000000000000'
    },
    l2: {
      chainId: l2ChainId || Number(process.env.PRIVIDIUM_CHAIN_ID ?? 0),
      vaultFactory: vaultFactory.address
    },
    assetRouter: process.env.ASSET_ROUTER_ADDRESS ?? '',
    nativeTokenVault: process.env.NATIVE_TOKEN_VAULT_ADDRESS ?? '',
    deployedAt: new Date().toISOString()
  };

  const outDir = resolve(process.cwd(), 'deployments');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${payload.l1.chainId}.json`), JSON.stringify(payload, null, 2));
  console.log(payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
