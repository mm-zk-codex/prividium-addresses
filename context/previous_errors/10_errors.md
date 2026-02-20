# Human-applied fixes in `prividium-safe` (things Codex should not get wrong again)

This note summarizes the *human* commits that corrected critical issues introduced during Codex-driven development, and turns them into concrete “do/don’t” rules for future Codex runs.

Repo: `mm-zk-codex/prividium-safe` (main branch)

---

## 1) Bridgehub gas/base-cost estimation: **missing `chainId` arg**

**Human fix commit:** `a4f0065` — “fixed gas request” citeturn6view0

### What went wrong
The UI called `Bridgehub.l2TransactionBaseCost(...)` with the wrong ABI/argument list (missing `chainId`), so the request could fail or compute incorrect costs.

### What the human changed
- Updated the `bridgehubAbi` for `l2TransactionBaseCost` to include `chainId` as the first parameter.
- Updated the call arguments to include `L2_CHAIN_ID` first.

### Codex rule
- **When calling Bridgehub `l2TransactionBaseCost`, always pass `chainId` first** and keep ABI + callsite in sync.
- If you touch ABIs, **update both** the ABI definition *and* every place that calls it.

---

## 2) Safe Tx UI auth callback: **callback page not included in Vite build**

**Human fix commits:**
- `84039a8` — “Fixes for callback and vite config” citeturn8view0
- `6a6bfc6` — “added build to vite config” citeturn9view0

### What went wrong
The auth callback HTML was placed/served in a way that worked in dev, but **was not guaranteed to be built and emitted** in production bundles.

### What the human changed
- Moved the callback HTML from `safe-tx-ui/public/auth/callback.html` to `safe-tx-ui/auth/callback.html` (so it can be treated as an input HTML page, not just a static public file). citeturn8view0
- Updated `vite.config.js` to use Rollup multi-page inputs so both:
  - `index.html`
  - `auth/callback.html`
  are included in the build output. citeturn9view0
- Added missing `resolve` import needed for those paths. citeturn8view0

### Codex rule
- If you add a **secondary HTML entrypoint** (auth callback, embedded page, etc.), do **all** of:
  1) Put it in the source tree (not only under `public/`), and  
  2) Add it to `build.rollupOptions.input` so it is emitted on `vite build`.

---

## 3) Permissions / profile endpoint and payload shape: **wrong endpoint + brittle address extraction**

**Human fix commit:** `9d73a6a` — “making it work” citeturn7view2

### What went wrong
- Backend auth middleware called the wrong permissions endpoint (`/api/auth/me`), causing auth to fail against the real service.
- Address extraction assumed only a narrow payload shape.

### What the human changed
- Switched the “who am I” call to `/api/profiles/me` instead of `/api/auth/me`. citeturn7view2
- Made wallet address extraction more robust by checking additional locations in the returned payload (e.g., `wallets[0].walletAddress`). citeturn7view2

### Codex rule
- **Don’t guess** auth endpoints. If integrating with Prividium permissions/profile APIs, prefer:
  - `/api/profiles/me` for identity, unless a documented alternative exists.
- When parsing identity payloads, be defensive:
  - accept multiple common shapes and normalize to lowercase `0x…`.

---

## 4) Database schema drift: **proposal recipient column mismatch**

**Human fix commit:** `9d73a6a` — “making it work” citeturn7view2

### What went wrong
The DB schema used a generic `to` column, while the code/feature semantics expected a **withdrawal recipient** field. This mismatch can break inserts/queries or make future refactors error-prone.

### What the human changed
- In `examples/safe-tx-service/sql/init.sql`, changed the proposals table column from:
  - `to TEXT NOT NULL`
  to:
  - `recipient TEXT NOT NULL` citeturn7view2

### Codex rule
- **Keep SQL schema names aligned with domain meaning** (e.g., `recipient` for withdrawals).
- When you rename a column in schema, ensure **all** related code paths and queries are updated together.

---

## 5) Long-running loops + error handling: **service should not crash on transient errors**

**Human fix commit:** `f9284d2` — “don't crash on errors.” citeturn10view0turn16view0

### What went wrong
Background tasks (sync / withdrawal polling) and request handlers could throw and bring the Node process down if errors weren’t contained.

### What the human changed
- Added an Express error-handling middleware to return JSON errors instead of crashing the process. citeturn16view0
- Wrapped periodic `setInterval` loops (sync + withdrawals) in `try/catch` so transient failures log errors but don’t kill the service. citeturn16view0

### Codex rule
- Any background polling loop **must** be wrapped in `try/catch`.
- Always include a final Express error handler (`app.use((err, req, res, next) => …)`) in APIs.
- Treat network/RPC/DB errors as expected; **log and continue** unless a hard-fail is required.

---

# Quick checklist for future Codex PRs

- [ ] ABI + callsites match (especially chainId/order-sensitive functions).
- [ ] Any extra HTML entrypoint is added to Vite/Rollup `input`.
- [ ] Auth integration uses the correct documented endpoint (`/api/profiles/me`) and parses payloads defensively.
- [ ] SQL schema and code semantics use consistent naming (`recipient`, etc.).
- [ ] Polling loops have `try/catch`; Express has an error middleware; service doesn’t crash on transient errors.