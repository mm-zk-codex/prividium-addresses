import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import hre from 'hardhat';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  const bridgehub = process.env.BRIDGEHUB_ADDRESS as `0x${string}` | undefined;
  const l2ChainId = Number(process.env.L2_CHAIN_ID ?? 0);
  if (!l2ChainId) throw new Error('L2_CHAIN_ID  is required');

  const { viem, network } = hre;

  // Deploy L1 factory on the active hardhat network.
  const forwarderFactoryL1 = await viem.deployContract('ForwarderFactoryL1');

  // Deploy L2 vault factory via explicit L2 RPC + signer so it lands on L2, not the active Hardhat network.
  const l2RpcUrl = process.env.L2_RPC_URL;
  const l2Pk = (process.env.L2_DEPLOYER_PRIVATE_KEY) as `0x${string}` | undefined;
  if (!l2RpcUrl || !l2Pk) {
    throw new Error('L2_RPC_URL (or RPC_URL_PRIVIDIUM) and L2_DEPLOYER_PRIVATE_KEY (or RELAYER_L2_PRIVATE_KEY) are required');
  }

  const vaultFactoryArtifactPath = resolve(process.cwd(), 'artifacts/src/l2/VaultFactory.sol/VaultFactory.json');
  const vaultFactoryArtifact = JSON.parse(readFileSync(vaultFactoryArtifactPath, 'utf8')) as {
    abi: readonly unknown[];
    bytecode: `0x${string}`;
  };

  const l2Account = privateKeyToAccount(l2Pk);
  const l2WalletClient = createWalletClient({ account: l2Account, transport: http(l2RpcUrl, { fetchFn: authFetch }) });
  const l2PublicClient = createPublicClient({ transport: http(l2RpcUrl, { fetchFn: authFetch }) });

  const l2DeployTx = await l2WalletClient.deployContract({
    abi: vaultFactoryArtifact.abi,
    bytecode: vaultFactoryArtifact.bytecode,
    args: []
  });
  const l2Receipt = await l2PublicClient.waitForTransactionReceipt({ hash: l2DeployTx });
  if (!l2Receipt.contractAddress) throw new Error('L2 vault factory deployment did not return contractAddress');
  const vaultFactoryAddress = l2Receipt.contractAddress;

  const payload = {
    l1: {
      chainId: Number(network.config.chainId ?? process.env.L1_CHAIN_ID ?? 11155111),
      forwarderFactoryL1: forwarderFactoryL1.address,
      bridgehub: bridgehub ?? '0x0000000000000000000000000000000000000000'
    },
    l2: {
      chainId: l2ChainId,
      vaultFactory: vaultFactoryAddress
    },
    assetRouter: process.env.ASSET_ROUTER_ADDRESS ?? '',
    nativeTokenVault: process.env.NATIVE_TOKEN_VAULT_ADDRESS ?? '',
    deployedAt: new Date().toISOString()
  };

  if (process.env.CONTRACTS_JSON_PATH) {
    writeFileSync(process.env.CONTRACTS_JSON_PATH, JSON.stringify(payload, null, 2));
    console.log(`Deployment info written to ${process.env.CONTRACTS_JSON_PATH}`);
  } else {
    const outDir = resolve(process.cwd(), 'deployments');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `${payload.l1.chainId}.json`), JSON.stringify(payload, null, 2));
  }
  console.log(payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



async function authFetch(url: any, init = {}) {
  const serviceToken = await getServiceToken();

  const headers = {
    ...((init as any).headers || {}),
    Authorization: `Bearer ${serviceToken}`
  };

  let response = await fetch(url, { ...init, headers });

  return response;
}

let cached = { token: null, expiresAt: 0 };


export async function getServiceToken() {
  if (cached.token && Date.now() < cached.expiresAt) {
    return cached.token;
  }
  const permissionsApiBaseUrl = process.env.PRIVIDIUM_API_BASE_URL!;
  const pk = process.env.L2_DEPLOYER_PRIVATE_KEY!;
  const domain = process.env.SIWE_DOMAIN!;

  const account = privateKeyToAccount(pk as any);
  console.log("requesting siwe from ", `${permissionsApiBaseUrl}/api/siwe-messages`);
  const msgRes = await fetch(`${permissionsApiBaseUrl}/api/siwe-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, domain })
  });
  if (!msgRes.ok) {
    console.log("Error: ", await msgRes.text());
    throw new Error('Failed to request SIWE message for service auth');
  }
  const { msg } = await msgRes.json();

  const signature = await account.signMessage({ message: msg });

  const loginRes = await fetch(`${permissionsApiBaseUrl}/api/auth/login/crypto-native`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, signature })
  });
  if (!loginRes.ok) throw new Error('Failed to login service account');
  const { token } = await loginRes.json();

  cached = { token, expiresAt: Date.now() + 5 * 60 * 1000 };
  return token;
}