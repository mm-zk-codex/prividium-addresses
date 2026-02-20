import type { Address, Chain, Hex, Transport } from 'viem';
import type { OauthScope } from './popup-auth.js';
import { z } from 'zod';
export interface Storage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
export interface PrividiumConfig {
    clientId: string;
    chain: Omit<Chain, 'rpcUrls'>;
    authBaseUrl: string;
    redirectUrl: string;
    /**
     * @deprecated use the `prividiumApiBaseUrl` field instead
     */
    permissionsApiBaseUrl?: string;
    prividiumApiBaseUrl: string;
    storage?: Storage;
    onAuthExpiry?: () => void;
}
export declare const roleSchema: z.ZodObject<{
    roleName: z.ZodString;
}, z.core.$strip>;
export type UserRole = z.infer<typeof roleSchema>;
export declare const profileSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodCoercedDate<unknown>;
    displayName: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodCoercedDate<unknown>;
    roles: z.ZodArray<z.ZodObject<{
        roleName: z.ZodString;
    }, z.core.$strip>>;
    wallets: z.ZodArray<z.ZodUnknown>;
}, z.core.$strip>;
export type UserProfile = z.infer<typeof profileSchema>;
export interface AddNetworkParams {
    chainName?: string;
    chainId: string;
    nativeCurrency?: {
        name: string;
        symbol: string;
        decimals: number;
    };
    blockExplorerUrls?: string[];
}
export type AuthorizeTransactionParams = {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata: Hex;
    value: bigint;
} | {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata: Hex;
    value?: never;
} | {
    walletAddress: Address;
    toAddress: Address;
    nonce: number;
    calldata?: never;
    value: bigint;
};
export declare const authorizeTransactionResponseSchema: z.ZodObject<{
    message: z.ZodString;
    activeUntil: z.ZodString;
}, z.core.$strip>;
export type AuthorizeTransactionResponse = z.infer<typeof authorizeTransactionResponseSchema>;
export interface PrividiumChain {
    chain: Chain;
    transport: Transport;
    authorize(opts?: PopupOptions): Promise<string>;
    unauthorize(): void;
    isAuthorized(): boolean;
    getAuthHeaders(): Record<string, string> | null;
    fetchUser(): Promise<UserProfile>;
    getWalletToken(): Promise<string>;
    getWalletRpcUrl(): Promise<string>;
    invalidateWalletToken(): Promise<string>;
    authorizeTransaction(params: AuthorizeTransactionParams): Promise<AuthorizeTransactionResponse>;
    addNetworkToWallet(params?: AddNetworkParams): Promise<void>;
}
export declare const tokenDataSchema: z.ZodObject<{
    rawToken: z.ZodString;
    expiresAt: z.ZodCoercedDate<unknown>;
}, z.core.$strip>;
export interface TokenData {
    rawToken: string;
    expiresAt: Date;
}
export interface PopupOptions {
    popupSize?: {
        w: number;
        h: number;
    };
    scopes?: OauthScope[];
}
export declare const AUTH_ERRORS: {
    readonly INVALID_STATE: "Invalid state parameter";
    readonly NO_RECEIVED_STATE: "No state parameter";
    readonly NO_SAVED_STATE: "No saved state";
    readonly NO_TOKEN: "No token received";
    readonly EXPIRED_TOKEN: "Expired token";
    readonly INVALID_JWT: "Invalid JWT format";
    readonly AUTH_REQUIRED: "Authentication required";
};
export declare const STORAGE_KEYS: {
    readonly STATE_PREFIX: "prividium_auth_state_";
    readonly TOKEN_PREFIX: "prividium_token_";
};
