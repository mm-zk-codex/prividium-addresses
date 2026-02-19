import { concatHex, encodeAbiParameters, getAddress, keccak256, parseAbi, toHex } from 'viem';

export const DEFAULT_CHAIN_ID = 11155111;

export const depositStatus = ['issued', 'detected', 'deployed', 'swept', 'credited', 'failed'] as const;
export type DepositStatus = (typeof depositStatus)[number];

export interface AliasRow {
  aliasKey: string;
  normalizedEmail: string;
  suffix: string;
  recipientPrividiumAddress: string;
  createdAt: number;
}

export interface DepositRequestRow {
  trackingId: string;
  aliasKey: string;
  chainId: number;
  salt: string;
  depositAddress: string;
  status: DepositStatus;
  issuedAt: number;
  detectedAt: number | null;
  deployedAt: number | null;
  sweptAt: number | null;
  creditedAt: number | null;
  depositTxHash: string | null;
  deployTxHash: string | null;
  sweepTxHash: string | null;
  amountWei: string | null;
  error: string | null;
}

export const FACTORY_ABI = parseAbi([
  'function computeAddress(bytes32 salt, bytes initCode) view returns (address)',
  'function deploy(bytes32 salt, address recipient, address adapter) returns (address)'
]);

export const FORWARDER_ABI = parseAbi(['function sweepNative(bytes metadata)']);

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function parseEmailAndSuffix(emailInput: string, suffixInput?: string): { normalizedEmail: string; suffix: string } {
  const trimmed = emailInput.trim();
  let base = trimmed;
  let inferredSuffix = '';
  const hashIdx = trimmed.lastIndexOf('#');
  if (hashIdx > -1) {
    base = trimmed.slice(0, hashIdx);
    inferredSuffix = trimmed.slice(hashIdx + 1);
  } else {
    const atIdx = trimmed.indexOf('@');
    const plusIdx = trimmed.indexOf('+');
    if (plusIdx > -1 && atIdx > plusIdx) {
      inferredSuffix = trimmed.slice(plusIdx + 1, atIdx);
      base = `${trimmed.slice(0, plusIdx)}${trimmed.slice(atIdx)}`;
    }
  }
  return { normalizedEmail: normalizeEmail(base), suffix: (suffixInput ?? inferredSuffix ?? '').trim().toLowerCase() };
}

export function aliasKeyFromParts(normalizedEmail: string, suffix: string): string {
  return keccak256(toHex(`${normalizedEmail}#${suffix}`));
}

export function computeSalt(aliasKey: string, requestNonce: string): string {
  return keccak256(concatHex([aliasKey as `0x${string}`, requestNonce as `0x${string}`]));
}

export function buildForwarderInitCode(forwarderCreationCode: string, recipient: string, adapter: string): `0x${string}` {
  return concatHex([
    forwarderCreationCode as `0x${string}`,
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [getAddress(recipient), getAddress(adapter)]
    )
  ]);
}
