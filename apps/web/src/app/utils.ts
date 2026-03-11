import { formatUnits } from 'viem';
import { STATUS_LABELS, STATUS_STEP } from './constants';
import type { Route, StepperStep } from './types';

export function setCookie(name: string, value: string, days = 30) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}`;
}

export function getCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((x) => x.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

export function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
export const normalizeStatus = (status?: string) => STATUS_LABELS[(status ?? '').toLowerCase()] ?? 'In progress';

export const hasValue = (amount: unknown) => {
  try {
    return BigInt(String(amount ?? '0')) > 0n;
  } catch {
    return false;
  }
};

export const trimTrailingZeros = (value: string) => value.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
export const formatBalanceValue = (value: bigint, decimals: number) => trimTrailingZeros(formatUnits(value, decimals));

export const statusStep = (status?: string, stuck?: boolean): StepperStep => {
  if (stuck) return 'bridge';
  const normalized = (status ?? '').toLowerCase();
  return STATUS_STEP[normalized] ?? 'deposit';
};

export function getInitialRoute(): Route {
  if (window.location.pathname.startsWith('/transfer')) return '/transfer';
  return window.location.pathname.startsWith('/portal') ? '/portal' : '/send';
}
