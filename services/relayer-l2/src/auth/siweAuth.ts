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
  siweDomain: string;
  siweUri?: string;
  siweStatement?: string;
  siweResources?: string[];
  fetchFn?: typeof fetch;
};

type AuthorizeTxParams = {
  walletAddress: `0x${string}`;
  contractAddress: `0x${string}`;
  nonce: number;
  calldata?: `0x${string}`;
  value?: bigint;
};

export class SiweAuthManager {
  private readonly account;
  private readonly proxyRpcUrl: string;
  private readonly authBaseUrl: string;
  private readonly siweDomain: string;
  private readonly chainId: number;
  private readonly siweUri?: string;
  private readonly siweStatement?: string;
  private readonly siweResources?: string[];
  private readonly fetchFn: typeof fetch;
  private token: string | null = null;
  private tokenExpiresAt: number | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(config: SiweAuthConfig) {
    this.account = privateKeyToAccount(config.privateKey);
    this.proxyRpcUrl = config.proxyRpcUrl;
    this.authBaseUrl = config.authBaseUrl.replace(/\/$/, '');
    this.siweDomain = config.siweDomain;
    this.chainId = config.chainId;
    this.siweUri = config.siweUri;
    this.siweStatement = config.siweStatement;
    this.siweResources = config.siweResources;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  getAddress() {
    return this.account.address;
  }

  async ensureAuthorized() {
    if (this.isTokenUsable()) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  async getAuthHeaders() {
    await this.ensureAuthorized();
    if (!this.token) throw new Error('Failed to acquire Prividium token');
    return { Authorization: `Bearer ${this.token}` };
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
    this.tokenExpiresAt = null;
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

  private isTokenUsable() {
    if (!this.token) return false;
    if (!this.tokenExpiresAt) return true;
    return Date.now() + 15_000 < this.tokenExpiresAt;
  }

  private async login() {
    const nonceRes = await this.fetchFn(`${this.authBaseUrl}/api/siwe-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: this.account.address,
        domain: this.siweDomain,
        ...(this.siweUri ? { uri: this.siweUri } : {}),
        ...(this.siweStatement ? { statement: this.siweStatement } : {}),
        chainId: this.chainId,
        ...(this.siweResources?.length ? { resources: this.siweResources } : {})
      })
    });
    if (!nonceRes.ok) throw new Error(`SIWE nonce request failed: ${nonceRes.status} ${await nonceRes.text()}`);
    const nonceData = (await nonceRes.json()) as { msg?: string };
    if (!nonceData.msg) throw new Error('SIWE nonce response missing msg');

    const signature = await this.account.signMessage({ message: nonceData.msg });
    const loginRes = await this.fetchFn(`${this.authBaseUrl}/api/auth/login/crypto-native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: nonceData.msg, signature })
    });
    if (!loginRes.ok) throw new Error(`SIWE login failed: ${loginRes.status} ${await loginRes.text()}`);
    const loginData = (await loginRes.json()) as { token?: string; expiresAt?: string };
    if (!loginData.token) throw new Error('SIWE login response missing token');

    this.token = loginData.token;
    this.tokenExpiresAt = loginData.expiresAt ? Date.parse(loginData.expiresAt) : null;
  }
}
