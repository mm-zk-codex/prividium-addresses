import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http, injected, WagmiProvider } from 'wagmi';
import { PrividiumAuthProvider } from '../auth/PrividiumAuth';
import { prividium } from './prividium';
import { l1Chain, l1ChainId, l1ChainRpcUrl } from './l1Chain';
import { prividiumChain, prividiumChainId } from './prividiumChain';

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [l1Chain, prividiumChain],
  connectors: [injected()],
  transports: {
    [l1ChainId]: http(l1ChainRpcUrl),
    [prividiumChainId]: prividium.transport
  }
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PrividiumAuthProvider>{children}</PrividiumAuthProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
