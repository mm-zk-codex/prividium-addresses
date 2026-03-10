interface ImportMetaEnv {
  readonly VITE_RESOLVER_URL?: string;
  readonly VITE_L1_CHAIN_ID?: string;
  readonly VITE_L1_CHAIN_NAME?: string;
  readonly VITE_L1_RPC_URL?: string;
  readonly VITE_L1_BLOCK_EXPLORER_URL?: string;
  readonly VITE_PRIVIDIUM_RPC_URL?: string;
  readonly VITE_PRIVIDIUM_CLIENT_ID?: string;
  readonly VITE_PRIVIDIUM_AUTH_BASE_URL?: string;
  readonly VITE_PRIVIDIUM_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
