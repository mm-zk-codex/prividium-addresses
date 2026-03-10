export type AliasResult = 'match' | 'maybe_needs_suffix' | 'not_found';
export type Route = '/send' | '/portal';
export type StepperStep = 'deposit' | 'bridge' | 'finalize' | 'complete';
export type SendDepositTab = 'details' | 'send';

export type SupportedToken = {
  symbol: string;
  name: string;
  decimals: number;
  l1Address: string;
};
