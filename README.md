# Prividium Addresses PoC (Phase 2)

Phase 2 implements the 2-hop counterfactual flow:

1. Sender only gets one L1 deposit address `Y` and sends ETH/ERC20 there.
2. L1 relayer deploys `StealthForwarderL1` at `Y` and bridges to L2 vault address `X`.
3. L2 relayer deploys `OneWayVault` at `X` and sweeps to recipient wallet `R`.
4. Operator pays deployment + bridge mint fees.
5. Operator cannot redirect funds because forwarder/vault destinations are immutable.

## Components

- `contracts/src/l1`: `ForwarderFactoryL1`, `StealthForwarderL1`
- `contracts/src/l2`: `VaultFactory`, `OneWayVault`
- `services/resolver`: alias + request issuance + X/Y computation
- `services/relayer-l1`: detects Y, deploys forwarder, submits bridge tx
- `services/relayer-l2`: detects X arrival, deploys vault, sweeps to R
- `apps/send-web`: sender UX for Y + timeline
- `apps/prividium-web`: recipient alias management + X/Y status table

## Environment

Example values (`infra/.env`):

- `L1_RPC_URL=...`
- `L2_RPC_URL=...`
- `CONTRACTS_JSON_PATH=contracts/deployments/11155111.json`
- `RELAYER_L1_PRIVATE_KEY=0x...`
- `RELAYER_L2_PRIVATE_KEY=0x...`
- `L2_DEPLOYER_PRIVATE_KEY=0x...` (optional; defaults to `RELAYER_L2_PRIVATE_KEY` for deploy script)
- `REFUND_RECIPIENT_L2=0x...` (default relayer L2 wallet)
- `BRIDGEHUB_ADDRESS=0x...`
- `ASSET_ROUTER_ADDRESS=0x...`
- `NATIVE_TOKEN_VAULT_ADDRESS=0x...`
- `MINT_VALUE_WEI_ETH_DEFAULT=...`
- `MINT_VALUE_WEI_ERC20_DEFAULT=...`
- `L2_GAS_LIMIT_ETH_DEFAULT=...`
- `L2_GAS_LIMIT_ERC20_DEFAULT=...`
- `L2_GAS_PER_PUBDATA_DEFAULT=...`
- `PRIVIDIUM_JWT=...` (for authenticated L2 RPC reads/writes)

## Runbook

1. Install:
   ```bash
   pnpm install
   ```
2. Build contracts:
   ```bash
   pnpm --filter contracts build
   ```
3. Deploy factories (L1+L2 output JSON):
   ```bash
   pnpm --filter contracts run deploy
   ```
4. Fetch bridge dependencies (`assetRouter`, `nativeTokenVault`):
   ```bash
   pnpm --filter contracts exec hardhat run script/fetchBridgeDeps.ts --network sepolia
   ```
5. Start resolver:
   ```bash
   pnpm --filter resolver dev
   ```
6. Start relayers:
   ```bash
   pnpm --filter relayer-l1 dev
   pnpm --filter relayer-l2 dev
   ```
7. Start UIs:
   ```bash
   pnpm --filter send-web dev
   pnpm --filter prividium-web dev
   ```
8. Register alias in recipient portal.
9. Request deposit address in sender app.
10. Send ETH/ERC20 to `Y` on L1.
11. Observe statuses: `issued -> l1_detected -> l1_bridging_submitted -> l2_arrived -> credited`.
