# Prividium Addresses PoC (Phase 2)

Phase 2 now runs as **single deposit address per alias** with automatic asset detection:

1. Sender gets one L1 deposit address `Y` (no asset selector in UI).
2. Sender may transfer ETH or a supported ERC20 token to `Y`.
3. L1 relayer detects what arrived, deploys `StealthForwarderL1` if needed, then bridges.
4. L2 relayer detects arrival at `X`, deploys `OneWayVault` if needed, and sweeps to recipient wallet `R`.
5. Addresses remain valid forever; additional deposits to same `Y` create new `deposit_events` and are processed again.

## Components

- `services/resolver`: alias/auth + deterministic address issuance + event queries
- `services/relayer-l1`: auto-detect ETH/supported ERC20 on Y, bridge, token registry cache
- `services/relayer-l2`: detect L2 arrivals, sweep, periodic reconciliation scans
- `apps/send-web`: sender UX (email+suffix -> deposit address + event history)
- `apps/prividium-web`: recipient alias registration with authenticated `displayName`

## Config

- `SUPPORTED_ERC20_JSON_PATH` (default: `infra/supported-erc20.json`)
- JSON format:

```json
[
  { "l1Address": "0x...", "symbol": "USDC", "decimals": 6, "name": "USD Coin" }
]
```

Resolver exposes `GET /supported-erc20` for display/debug.

## Runbook

1. `pnpm install`
2. `pnpm --filter contracts build`
3. `pnpm --filter contracts run deploy`
4. Start services:
   - `pnpm --filter resolver dev`
   - `pnpm --filter relayer-l1 dev`
   - `pnpm --filter relayer-l2 dev`
5. Start UIs:
   - `pnpm --filter send-web dev`
   - `pnpm --filter prividium-web dev`
6. Login in recipient portal (uses authenticated `user.displayName` identity).
7. Register alias and generate deposit address from sender app.
8. Send ETH or supported ERC20 to `Y` (same `Y` can be reused forever).
9. Track event lifecycle in UI/DB:
   - `detected_l1 -> l1_forwarder_deployed -> l1_bridging_submitted -> l2_arrived -> l2_vault_deployed -> credited`
