# Prividium Addresses PoC (Unified Frontend)

This repo keeps the Phase 3 behavior (single Y deposit address, ETH + supported ERC20 autodetect, bridge to Y on L2 (self-deposit), then forward Y->X->R) and now ships a **single frontend app** with both sender and recipient experiences.

## Components

- `packages/config`: shared bridge config loader
- `services/tools`: `fetchBridgeConfig.ts` metadata fetcher
- `services/resolver`: alias/auth + deterministic address issuance + `/accepted-tokens`, `/alias/exists`, retry API
- `services/relayer-l1`: auto-detect ETH/supported ERC20, bridge, retry/backoff + stuck
- `services/relayer-l2`: L2 arrival processing + retry/backoff + stuck

- L1 forwarder now enforces **self-deposit only** on bridge calls (destination on L2 is always `Y` / `address(this)`).
- L2 relayer now performs an extra internal hop: deploy/sweep `Y -> X`, then deploy/sweep `X -> R`.
- `apps/web`: unified UI with top navigation:
  - **Send** (public)
  - **Recipient Portal** (login-gated)

## Unified web app behavior

- Default route is `/send`.
- `/portal` is available in the same app and requires Prividium login.
- Login state is shared across routes and refreshes portal data after successful login.
- Logout clears auth state and returns the user to `/send`.
- Sender flow retains:
  - email -> optional suffix via `/alias/exists`
  - deposit request + `trackingId` cookie persistence
  - status/events polling
  - accepted token list
  - QR code for deposit address `Y`
  - support/troubleshooting block using `GET /deposit/:trackingId/support`
- Recipient portal retains:
  - alias registration (server-verified display name, no email input)
  - deposit/event list
  - per-event retry and retry-all-stuck actions

## Bridge config

`infra/bridge-config.json` includes L1/L2 addresses and token metadata.


When running `contracts/script/deploy.ts`, the script now deploys `ForwarderFactoryL1` on both L1 and L2 via CREATE2 and enforces identical addresses across chains.

Fetch/update it with:

- `pnpm --filter tools run fetch-bridge-config`

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
6. Start unified UI:
   - `pnpm --filter web dev`
7. Open the app (default `/send`), then login and use `/portal` for recipient actions.

## Production with Docker Compose

A production Docker setup is available at the repo root:

- `Dockerfile` (multi-stage targets: `resolver`, `relayer-l1`, `relayer-l2`, `web`, `tools`)
- `docker-compose.yml` (production stack + one-off init profile)
- `.env.example` (copy to `.env` and fill secrets)
- `scripts/README_DOCKER.md` (full VPS runbook)

Quick start:

```bash
cp .env.example .env
docker compose build
docker compose --profile init run --rm fetch-bridge-config
docker compose up -d
```

# CREATE2

This assumes that create2 is deployed on L2.

If not:

```shell
cast send -r http://localhost:5050 0x3fab184622dc19b6109349b94811493bf2a45362 --value 0.1ether --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

 cast rpc --rpc-url http://localhost:5050  eth_sendRawTransaction \
  0xf8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222
"0xeddf9e61fb9d8f5111840daef55e5fde0041f5702856532cdbb5a02998033d26"
```

Then check:

```shell
cast code -r http://localhost:5050 0x4e59b44847b379578588920cA78FbF26c0B4956C
```