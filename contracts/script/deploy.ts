import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';

async function main() {
  const treasury = process.env.TREASURY_ADDRESS;
  if (!treasury) throw new Error('TREASURY_ADDRESS required');

  const { viem, network } = hre;
  const adapter = await viem.deployContract('BridgeAdapterMock', [treasury as `0x${string}`]);
  const factory = await viem.deployContract('ForwarderFactory');

  const payload = {
    chainId: Number(network.config.chainId ?? 11155111),
    factory: factory.address,
    adapter: adapter.address,
    deployedAt: new Date().toISOString()
  };

  const outDir = resolve(process.cwd(), 'deployments');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${payload.chainId}.json`), JSON.stringify(payload, null, 2));
  console.log(payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
