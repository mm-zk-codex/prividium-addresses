# Prividium Addresses PoC (Phase 1)

Phase 1 implements a single-chain (Sepolia `11155111`) native ETH flow:

1. Recipient registers `email + optional suffix` alias in Prividium portal.
2. Public send page asks resolver for a fresh CREATE2 deposit address.
3. Sender funds the counterfactual address before deployment.
4. Relayer detects balance, deploys `StealthForwarder`, sweeps to `BridgeAdapterMock`.
5. Mock adapter forwards funds to treasury on same chain and marks request `credited`.

## Monorepo Layout

- `apps/send-web` — public send page.
- `apps/prividium-web` — Prividium login + alias management + deposit status list.
- `services/resolver` — alias/deposit API + SQLite.
- `services/relayer` — worker polling SQLite and chain.
- `contracts` — Hardhat Solidity contracts, deployment script, tests.
- `packages/types` — shared TS types and utilities.
- `infra` — `.env.example`, docker-compose.

## Data Model

SQLite tables are created by resolver startup:

- `aliases` (`aliasKey`, `normalizedEmail`, `suffix`, `recipientPrividiumAddress`, `createdAt`)
- `deposit_requests` (`trackingId`, `aliasKey`, `chainId`, `salt`, `depositAddress`, lifecycle timestamps/tx hashes/status/error)

Phase 2 placeholders are represented by retaining alias-centered keying and metadata in deposits.

## API

Resolver endpoints:

- `POST /alias/register`
- `POST /deposit/request`
- `GET /deposit/:trackingId`
- `GET /alias/deposits?aliasKey=0x...`
- `GET /health`
- `GET /config`

## Runbook

1. Install dependencies.
   ```bash
   pnpm install
   ```
2. Copy and fill environment values.
   ```bash
   cp infra/.env.example infra/.env
   ```
3. Compile contracts.
   ```bash
   pnpm --filter contracts build
   ```
4. Deploy contracts to Sepolia.
   ```bash
   pnpm --filter contracts run deploy
   ```
   Produces `contracts/deployments/11155111.json`.
5. Start resolver.
   ```bash
   pnpm --filter resolver dev
   ```
6. Start relayer.
   ```bash
   pnpm --filter relayer dev
   ```
7. Start send web app.
   ```bash
   pnpm --filter send-web dev
   ```
8. Start Prividium recipient portal app.
   ```bash
   pnpm --filter prividium-web dev
   ```
9. In `prividium-web`: login with Prividium, register alias.
10. In `send-web`: generate deposit address for same email/suffix.
11. Send Sepolia ETH to generated deposit address.
12. Observe status flow: `issued -> detected -> deployed -> swept -> credited`.
13. Verify treasury received ETH.

## Notes

- Scope deliberately excludes ERC20, withdrawals, and cross-chain bridging in Phase 1.
- `BridgeAdapterMock.bridgeNative` ignores recipient and forwards to treasury.
- Relayer is idempotent: re-checks code/balance before deploy/sweep.


{
  chainId: 11155111,
  factory: '0xe55e0fa403933fc3a07e020f542aa3b93a82013e',
  adapter: '0xbfd494cbf6751f03829a56e2074e70b41d54320f',
  deployedAt: '2026-02-19T10:01:18.616Z'
}

pnpm -F @prividium-poc/types build


 pnpm approve-builds

prividium web required a 'local' env file.

