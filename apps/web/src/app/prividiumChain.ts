import { defineChain } from 'viem';

const prividiumRpcUrl = import.meta.env.VITE_PRIVIDIUM_RPC_URL ?? 'http://localhost:8000/rpc';
const prividiumChainId = Number(import.meta.env.VITE_PRIVIDIUM_CHAIN_ID ?? 6565);
const prividiumChainName = import.meta.env.VITE_PRIVIDIUM_CHAIN_NAME ?? 'Prividium';
const prividiumBlockExplorerUrl = import.meta.env.VITE_PRIVIDIUM_BLOCK_EXPLORER_URL;

export const prividiumChain = defineChain({
  id: prividiumChainId,
  name: prividiumChainName,
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: { http: [prividiumRpcUrl] },
    public: { http: [prividiumRpcUrl] }
  },
  blockExplorers: prividiumBlockExplorerUrl ? {
    default: {
      name: `${prividiumChainName} Explorer`,
      url: prividiumBlockExplorerUrl
    }
  } : undefined
});

export { prividiumChainId, prividiumChainName, prividiumRpcUrl };
