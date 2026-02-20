# Prividium Addresses PoC (Phase 3)

Phase 3 keeps all Phase 2 behavior (single Y deposit address, ETH + supported ERC20 autodetect, bridge to vault X, sweep to recipient R) and adds:

- bridge token metadata config (`infra/bridge-config.json`)
- stuck/retry lifecycle with manual requeue from recipient portal
- send page cookie persistence + accepted tokens display
- email-first then suffix UX via `/alias/exists`
- QR code and copy actions for payment flows

## Components

- `packages/config`: shared bridge config loader
- `services/tools`: `fetchBridgeConfig.ts` metadata fetcher
- `services/resolver`: alias/auth + deterministic address issuance + `/accepted-tokens`, `/alias/exists`, retry API
- `services/relayer-l1`: auto-detect ETH/supported ERC20, bridge, retry/backoff + stuck
- `services/relayer-l2`: L2 arrival processing + retry/backoff + stuck
- `apps/send-web`: sender UX with cookies, accepted tokens, suffix step, QR code
- `apps/prividium-web`: recipient portal with stuck event visibility + retry controls

## Bridge config

`infra/bridge-config.json` now includes L1/L2 addresses and token metadata:

```json
{
  "l1": { "chainId": 11155111, "bridgehub": "0x...", "assetRouter": "0x...", "nativeTokenVault": "0x...", "forwarderFactory": "0x..." },
  "l2": { "chainId": 10, "vaultFactory": "0x..." },
  "tokens": [
    {
      "l1Address": "0x...",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "assetId": "0x...",
      "l2Address": "0x..."
    }
  ]
}
```

Fetch/update it with:

- `pnpm --filter tools run fetch-bridge-config`

## New env vars

- `BRIDGE_CONFIG_JSON_PATH` (default `infra/bridge-config.json`)
- `MAX_ATTEMPTS` (default `5`)
- `BASE_DELAY_SECONDS` (default `15`)
- `MAX_DELAY_SECONDS` (default `900`)
- `AUTO_REGISTER_TOKENS` (`1` enables optional registration flow; currently read-only fetch script)

## APIs

- `GET /accepted-tokens`
- `POST /alias/exists` -> `{ result: "match" | "maybe_needs_suffix" | "not_found" }`
- `POST /deposit-events/:id/retry` (auth required; ownership enforced)

## Runbook

1. `pnpm install`
2. `pnpm --filter contracts build`
3. `pnpm --filter contracts run deploy`
4. `pnpm --filter tools run fetch-bridge-config`
5. Start services:
   - `pnpm --filter resolver dev`
   - `pnpm --filter relayer-l1 dev`
   - `pnpm --filter relayer-l2 dev`
6. Start UIs:
   - `pnpm --filter send-web dev`
   - `pnpm --filter prividium-web dev`
7. Register alias (recipient portal), generate deposit flow (send page), send ETH or accepted ERC20.

Lifecycle now includes retry state:

- normal: `detected_l1 -> l1_forwarder_deployed -> l1_bridging_submitted -> l2_arrived -> l2_vault_deployed -> credited`
- error path: `l1_failed|l2_failed` with backoff retries until `stuck`
- manual recover: retry button sets stuck event back to queue
