import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

type ViemClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
};

type SiweAuthConfig = {
  privateKey: `0x${string}`;
  chainId: number;
  proxyRpcUrl: string;
  authBaseUrl: string;
  siweDomain?: string;
  fetchFn?: typeof fetch;
};

type AuthorizeTxParams = {
  walletAddress: `0x${string}`;
  contractAddress: `0x${string}`;
  nonce: number;
  calldata?: `0x${string}`;
  value?: bigint;
};

const SERVICE_TOKEN_TTL_MS = 55 * 60 * 1000;

function getDomainFromUrl(url: string) {
  return new URL(url).host;
}

export class SiweAuthManager {
  private readonly account;
  private readonly proxyRpcUrl: string;
  private readonly authBaseUrl: string;
  private readonly siweDomain: string;
  private readonly fetchFn: typeof fetch;
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private loginPromise: Promise<void> | null = null;

  constructor(config: SiweAuthConfig) {
    this.account = privateKeyToAccount(config.privateKey);
    this.proxyRpcUrl = config.proxyRpcUrl;
    this.authBaseUrl = config.authBaseUrl.replace(/\/$/, '');
    this.siweDomain = config.siweDomain || getDomainFromUrl(this.authBaseUrl);
    this.fetchFn = config.fetchFn ?? fetch;
    void config.chainId;
  }

  getAddress() {
    return this.account.address;
  }

  async getServiceToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;

    if (!this.token) throw new Error('Failed to login service account');
    return this.token;
  }

  async getAuthHeaders() {
    const token = await this.getServiceToken();
    return { Authorization: `Bearer ${token}` };
  }

  async authorizeTransaction(params: AuthorizeTxParams) {
    const headers = await this.getAuthHeaders();
    const response = await this.fetchFn(`${this.authBaseUrl}/api/wallet/authorize-transaction`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: params.walletAddress,
        contractAddress: params.contractAddress,
        nonce: params.nonce,
        ...(params.calldata ? { calldata: params.calldata } : {}),
        ...(typeof params.value === 'bigint' ? { value: params.value.toString() } : {})
      })
    });
    if (response.status === 401 || response.status === 403) {
      this.clearToken();
      throw new Error(`Auth rejected while authorizing transaction: ${response.status}`);
    }
    if (!response.ok) throw new Error(`Failed authorizeTransaction: ${response.status} ${await response.text()}`);
    return response.json();
  }

  clearToken() {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  isAuthError(error: unknown) {
    const message = String((error as Error)?.message ?? error ?? '').toLowerCase();
    return message.includes('401') || message.includes('403') || message.includes('-32090') || message.includes('unauthorized');
  }

  async withAuthRetry<T>(fn: (clients: ViemClients) => Promise<T>) {
    try {
      const clients = await this.createClients();
      return await fn(clients);
    } catch (error) {
      if (!this.isAuthError(error)) throw error;
      this.clearToken();
      const clients = await this.createClients();
      return fn(clients);
    }
  }

  private async createClients(): Promise<ViemClients> {
    const headers = await this.getAuthHeaders();
    const transport = http(this.proxyRpcUrl, { fetchOptions: { headers } });
    return {
      publicClient: createPublicClient({ transport }),
      walletClient: createWalletClient({ transport, account: this.account })
    };
  }

  private async login() {
    const msgRes = await this.fetchFn(`${this.authBaseUrl}/api/siwe-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: this.account.address,
        domain: this.siweDomain
      })
    });
    if (!msgRes.ok) {
      throw new Error('Failed to request SIWE message for service auth');
    }

    const { msg } = (await msgRes.json()) as { msg?: string };
    if (!msg) throw new Error('SIWE nonce response missing msg');

    const signature = await this.account.signMessage({ message: msg });

    const loginRes = await this.fetchFn(`${this.authBaseUrl}/api/auth/login/crypto-native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, signature })
    });
    if (!loginRes.ok) throw new Error('Failed to login service account');

    const loginData = (await loginRes.json()) as { token?: string; expiresAt?: string };
    if (!loginData.token) throw new Error('SIWE login response missing token');

    this.token = loginData.token;
    this.tokenExpiresAt = loginData.expiresAt ? Date.parse(loginData.expiresAt) : Date.now() + SERVICE_TOKEN_TTL_MS;
  }
}
