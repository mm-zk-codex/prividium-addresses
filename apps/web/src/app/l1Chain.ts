import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';

const defaultSepoliaRpcUrl = sepolia.rpcUrls.default.http[0];
const l1RpcUrl = import.meta.env.VITE_L1_RPC_URL ?? defaultSepoliaRpcUrl;
const configuredChainId = Number(import.meta.env.VITE_L1_CHAIN_ID ?? sepolia.id);
const configuredChainName = import.meta.env.VITE_L1_CHAIN_NAME ?? (configuredChainId === sepolia.id ? 'Sepolia' : 'Local L1');
const blockExplorerUrl = import.meta.env.VITE_L1_BLOCK_EXPLORER_URL ?? sepolia.blockExplorers.default.url;

export const l1Chain = configuredChainId === sepolia.id ? sepolia : defineChain({
  id: configuredChainId,
  name: configuredChainName,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: { http: [l1RpcUrl as string] },
    public: { http: [l1RpcUrl as string] }
  },
  blockExplorers: blockExplorerUrl ? {
    default: {
      name: `${configuredChainName} Explorer`,
      url: blockExplorerUrl
    }
  } : undefined
});

export const l1ChainId = l1Chain.id;
export const l1ChainName = l1Chain.name;
export const l1ChainRpcUrl = l1RpcUrl;
