import { createPrividiumChain } from 'prividium';
import { prividiumChain } from './prividiumChain';

export const prividium = createPrividiumChain({
  clientId: import.meta.env.VITE_PRIVIDIUM_CLIENT_ID!,
  chain: prividiumChain,
  authBaseUrl: import.meta.env.VITE_PRIVIDIUM_AUTH_BASE_URL!,
  prividiumApiBaseUrl: import.meta.env.VITE_PRIVIDIUM_API_BASE_URL!,
  redirectUrl: `${window.location.origin}/auth/callback.html`
});
