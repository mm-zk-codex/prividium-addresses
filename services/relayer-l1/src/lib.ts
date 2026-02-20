import { readFileSync } from 'node:fs';
import { getAddress } from 'viem';

export type SupportedToken = { l1Address: string; symbol: string; decimals: number; name: string };

export function loadSupportedTokens(path: string): SupportedToken[] {
  const items = JSON.parse(readFileSync(path, 'utf8')) as SupportedToken[];
  return items.map((t) => ({ ...t, l1Address: getAddress(t.l1Address) }));
}

export function toTokenAllowlist(tokens: SupportedToken[]): Set<string> {
  return new Set(tokens.map((t) => t.l1Address.toLowerCase()));
}

export function tryAcquireInflight(current: number): boolean {
  return current === 0;
}

export function isTokenSupported(allowlist: Set<string>, token: string): boolean {
  return allowlist.has(token.toLowerCase());
}
