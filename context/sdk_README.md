# Prividium™ SDK & CLI

A TypeScript SDK and CLI for integrating with the Prividium™ authorization system. The SDK provides popup OAuth, token
management, and a viem transport for secure RPC; the CLI runs a local authenticated JSON-RPC proxy to your Prividium™
RPC and manages basic configuration.

## Features

- 🔐 **Popup-based OAuth Authentication** - Secure authentication flow using popup windows (browser)
- 🔑 **SIWE Backend Authentication** - Programmatic Sign-In with Ethereum for server-side use (`prividium/siwe`)
- 🔑 **JWT Token Management** - Automatic token storage, validation, and expiration handling
- 🌐 **Viem Integration** - Drop-in transport for viem clients with automatic auth headers
- 🛠️ **CLI Proxy** - Local authenticated JSON-RPC proxy and simple config management

## At a glance

- SDK (TypeScript): Authentication utilities, viem transport, wallet token enablement. See [Quick Start](#quick-start),
  [API Reference](#api-reference), and [Advanced Usage](#advanced-usage).
- CLI (`prividium`): Start a local authenticated RPC proxy and manage saved URLs. See [CLI](#cli).

## Installation

```bash
npm install prividium
```

CLI (optional):

```bash
npx prividium proxy
```

## Quick Start

### 1. Create a Prividium™ Chain

```typescript
import { createPrividiumChain } from 'prividium';
import { defineChain, createPublicClient, http } from 'viem';

// Define your chain
const prividiumChain = defineChain({
  id: 7777,
  name: 'Prividium™ Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.prividium.io' } }
});

// Create SDK instance
// Note: replace the URLs and clientId with your actual values
// Make sure clientId & redirectUrl are from a registered Application in the Admin Panel
const prividium = createPrividiumChain({
  clientId: 'your-client-id',
  chain: prividiumChain,
  rpcUrl: 'https://rpc.prividium.io',
  authBaseUrl: 'https://auth.prividium.io',
  prividiumApiBaseUrl: 'https://permissions.prividium.io/api',
  redirectUrl: window.location.origin + '/auth/callback',
  onAuthExpiry: () => {
    console.log('Authentication expired - please reconnect');
  }
});
```

### 2. Create Prividium™ Viem Client

```typescript
import { createPrividiumClient } from 'prividium';

// The SDK provides a pre-configured transport with automatic auth headers
const client = createPrividiumClient({
  chain: prividium.chain,
  transport: prividium.transport, // ✨ Auth headers are automatically included!
  account: '0x...' // 🔐 Provide user account to make `eth_call`s from that address
});
```

**Note:** Providing the account is required only for read operations that use `eth_call`. Prividium™ needs to know the
caller address to enforce permissions correctly.

### 3. Authenticate and Use

```typescript
// Check if already authenticated
if (!prividium.isAuthorized()) {
  // Trigger authentication popup
  await prividium.authorize();
}

// Now you can make authenticated RPC calls
const balance = await client.getBalance({
  address: '0x...'
});
```

### 4. Reading contract data

```typescript
import { createContract } from 'viem';
// Define contract
const greeterContract = createContract({
  address: '0x...',
  abi: [
    {
      name: 'getGreeting',
      type: 'function',
      inputs: [],
      outputs: [{ name: '', type: 'string' }],
      stateMutability: 'view'
    }
  ],
  client: client
});

// Read data
if (!client.account) {
  console.warn('Client account is not set. Connect wallet.');
} else {
  const greeting = await greeterContract.read.getGreeting();
  console.log('Greeting:', greeting);
}
```

### 5. Sending Transactions with Injected Wallets (MetaMask)

Before sending transactions through injected wallets, you need to add the Prividium™ network and enable wallet RPC for
each transaction.

```typescript
import { createWalletClient, custom, encodeFunctionData } from 'viem';

// Add Prividium™ network to MetaMask
await prividium.addNetworkToWallet();

// Create wallet client for MetaMask
const walletClient = createWalletClient({
  chain: prividium.chain,
  transport: custom(window.ethereum)
});

const [address] = await walletClient.getAddresses();

// Prepare transaction with viem
const greeterContract = '0x...';
const request = await walletClient.prepareTransactionRequest({
  account: address,
  to: greeterContract,
  data: encodeFunctionData({
    abi: [
      {
        name: 'setGreeting',
        type: 'function',
        inputs: [{ name: 'greeting', type: 'string' }],
        outputs: []
      }
    ],
    functionName: 'setGreeting',
    args: ['Hello, Prividium!'],
    value: 0n // Optional ETH value to send
  })
});

// Authorize transaction
await prividium.authorizeTransaction({
  walletAddress: address,
  contractAddress: greeterContract,
  nonce: Number(request.nonce),
  calldata: request.data,
  value: request.value
});

// Send transaction through MetaMask
const hash = await walletClient.sendTransaction(request);
```

**Note:** Call `authorizeTransaction(...)` before each transaction. Permission is transaction-specific and expires after
1 hour.

### 6. Setup OAuth Callback Page

The SDK requires a callback page to complete the authentication flow securely using `postMessage`. Create a callback
page at the `redirectUrl` you configured:

**Example: `public/auth/callback.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Authentication Callback</title>
    <script type="module">
      import { handleAuthCallback } from '@repo/prividium-sdk';

      // Handle the callback - this will post the token back to the parent window
      handleAuthCallback((error) => {
        console.error('Auth callback error:', error);
      });
    </script>
  </head>
  <body>
    <div
      style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif;"
    >
      <p>Completing authentication...</p>
    </div>
  </body>
</html>
```

**How it works:**

1. User clicks "Login" → SDK opens popup to Prividium™ user panel
2. User authenticates → user panel redirects popup to your callback page
3. Callback page calls `handleAuthCallback()` → token is posted back to parent via `postMessage`
4. SDK receives token, validates state parameter (CSRF protection), and closes popup
5. Your app is now authenticated

**Note:**

- The callback page must be hosted on the same origin as your main application that initiates the auth flow.

## OAuth Scopes

The SDK supports requesting specific OAuth scopes during authorization to ensure users meet certain requirements:

```typescript
import { createPrividiumChain, type OauthScope } from 'prividium';

const prividium = createPrividiumChain({
  clientId: 'your-client-id',
  chain: prividiumChain,
  rpcUrl: 'https://rpc.prividium.io',
  authBaseUrl: 'https://auth.prividium.io',
  prividiumApiBaseUrl: 'https://permissions.prividium.io/api',
  redirectUrl: window.location.origin + '/auth/callback',
  onAuthExpiry: () => {
    console.log('Authentication expired');
  }
});

await prividium.authorize({
  scope: ['wallet:required', 'network:required'] // Request specific scopes
});
```

### Available Scopes

- **`wallet:required`** - Ensures the user has at least one wallet address associated with their account
- **`network:required`** - Ensures the user has a wallet connected with the correct chain configuration

When scopes are specified, the authorization flow will validate that the user meets all requirements. If requirements
are not met, the user panel will guide them through the necessary setup steps before completing authentication.

## API Reference

### `createPrividiumChain(config)`

Creates a new Prividium™ SDK instance.

**Parameters:**

```typescript
interface PrividiumConfig {
  clientId: string; // OAuth client ID
  chain: Chain; // Viem chain configuration (without rpcUrls)
  authBaseUrl: string; // Authorization service base URL
  prividiumApiBaseUrl: string; // Permissions API service base URL
  redirectUrl: string; // OAuth redirect URL
  storage?: Storage; // Custom storage implementation (optional)
  onAuthExpiry?: () => void; // Called when authentication expires (optional)
}
```

**Returns:** `PrividiumChain`

### PrividiumChain Methods

#### `authorize(options?)`

Opens authentication popup and handles OAuth flow.

```typescript
await prividium.authorize({
  popupSize: { w: 600, h: 700 }, // Optional custom popup dimensions
  scopes: ['wallet:required', 'network:required'] // Optional scope requests
});
```

**Returns:** `Promise<string>` - JWT token

#### `unauthorize()`

Clears authentication state and tokens.

```typescript
prividium.unauthorize();
```

#### `isAuthorized()`

Checks if user is currently authenticated with valid token.

```typescript
const authenticated = prividium.isAuthorized();
```

**Returns:** `boolean`

#### `getAuthHeaders()`

Gets current authentication headers for manual use.

```typescript
const headers = prividium.getAuthHeaders();
// Returns: { Authorization: 'Bearer <token>' } | null
```

**Returns:** `Record<string, string> | null`

### `handleAuthCallback(onError?)`

Handles the OAuth callback on the redirect page. Call this function from your callback page to complete the
authentication flow.

```typescript
import { handleAuthCallback } from '@repo/prividium-sdk';

handleAuthCallback((error) => {
  // Optional: Handle errors (e.g., display error message to user)
  console.error('Auth callback error:', error);
});
```

**Parameters:**

- `onError?: (error: string) => void` - Optional callback to handle errors

**Behavior:**

- Extracts token and state from URL hash fragment
- Posts message to parent window via `postMessage`
- Automatically closes popup window on success
- Calls `onError` if any errors occur

### `createPrividiumClient(config)`

Creates a viem client.

**Parameters:**

```typescript
interface PrividiumClientConfig {
  chain: Chain; // Viem chain configuration
  transport: Transport; // Viem transport with Prividium™ auth headers
  account?: Address; // Optional user account for eth_call operations
  // Other viem client config options...
}
```

**Returns:** `PublicClient` - Viem client instance.

## SIWE Backend Authentication

For server-side or backend use cases, the SDK provides a separate entry point with programmatic SIWE (Sign-In with
Ethereum) authentication. Instead of a browser popup, you provide a viem account and the SDK handles the entire flow
automatically.

### Quick Start (SIWE)

```typescript
import { createPrividiumSiweChain } from 'prividium/siwe';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0xYOUR_PRIVATE_KEY');

const prividium = createPrividiumSiweChain({
  account,
  chain: { id: 7777, name: 'Prividium™ Chain' },
  prividiumApiBaseUrl: 'https://permissions.prividium.io',
  domain: 'my-backend.example.com',
  onReauthenticate: () => console.log('Session automatically refreshed'),
  onReauthenticateError: (err) => console.error('Re-auth failed:', err)
});

// Authenticate
await prividium.authorize();

// Make authenticated API calls
const user = await prividium.fetchUser();

// Transport automatically reauthenticates on session expiry
const balance = await client.getBalance({ address: prividium.address });
```

### `createPrividiumSiweChain(config)`

Creates an SDK instance with programmatic SIWE authentication.

**Parameters:**

```typescript
interface PrividiumSiweConfig {
  chain: Chain; // Viem chain configuration (without rpcUrls)
  prividiumApiBaseUrl: string; // Permissions API service base URL
  account: LocalAccount; // Viem account for signing (e.g. from privateKeyToAccount)
  domain: string; // Domain for SIWE message
  storage?: Storage; // Custom storage (defaults to MemoryStorage)
  autoReauthenticate?: boolean; // Auto-reauth on session expiry (default: true)
  onAuthExpiry?: () => void; // Called when auth expires and reauth is disabled/failed
  onReauthenticate?: () => void; // Called after successful automatic reauthentication
  onReauthenticateError?: (error: Error) => void; // Called when automatic reauthentication fails
}
```

**Returns:** `PrividiumSiweChain` - with all the same methods as `PrividiumChain` (except `addNetworkToWallet` which is
browser-only), plus `address` (the wallet address derived from the account).

### Auto-Reauthentication

When `autoReauthenticate` is `true` (default), the SDK automatically handles expired sessions:

1. Before each API call, checks if the session is still valid
2. On 401/403 responses, reauthenticates and retries the call once
3. Concurrent reauth attempts are deduplicated (only one SIWE flow runs at a time)

Disable with `autoReauthenticate: false` to handle expiry manually via `onAuthExpiry`.

## Advanced Usage

### Custom Storage

Implement custom storage for different environments:

```typescript
class CustomStorage implements Storage {
  getItem(key: string): string | null {
    // Your implementation
  }

  setItem(key: string, value: string): void {
    // Your implementation
  }

  removeItem(key: string): void {
    // Your implementation
  }
}

const prividium = createPrividiumChain({
  // ... other config
  storage: new CustomStorage()
});
```

### Multiple Chains

Support multiple Prividium™ chains:

```typescript
const testnetPrividium = createPrividiumChain({
  clientId: 'your-testnet-client-id',
  chain: testnetChain,
  rpcUrl: 'https://testnet-rpc.prividium.io',
  authBaseUrl: 'https://testnet-auth.prividium.io',
  prividiumApiBaseUrl: 'https://testnet-permissions.prividium.io/api',
  redirectUrl: window.location.origin + '/auth/callback'
});

const mainnetPrividium = createPrividiumChain({
  clientId: 'your-mainnet-client-id',
  chain: mainnetChain,
  rpcUrl: 'https://mainnet-rpc.prividium.io',
  authBaseUrl: 'https://mainnet-auth.prividium.io',
  prividiumApiBaseUrl: 'https://mainnet-permissions.prividium.io/api',
  redirectUrl: window.location.origin + '/auth/callback'
});
```

### Error Handling

Handle authentication errors gracefully:

```typescript
try {
  await prividium.authorize();
} catch (error) {
  if (error.message.includes('cancelled')) {
    console.log('User cancelled authentication');
  } else {
    console.error('Authentication failed:', error);
  }
}
```

### Manual HTTP Requests

Use authentication headers with custom HTTP requests:

```typescript
const headers = prividium.getAuthHeaders();
if (headers) {
  const response = await fetch('/api/protected', {
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  });
}
```

## Storage Keys

The SDK uses the following localStorage keys:

- `prividium_token_<chainId>` - Token storage
- `prividium_auth_state_<chainId>` - OAuth state parameter

## Security Considerations

1. **Token Storage**: Tokens are stored in localStorage by default. Consider custom storage for sensitive applications.

2. **CSRF Protection**: OAuth state parameter provides CSRF protection during authentication flow.

3. **Token Expiration**: SDK automatically validates token expiration and clears expired tokens.

4. **Origin Validation**: Popup messages are validated against the configured auth origin.

## CLI

Run a local, authenticated RPC proxy that forwards JSON-RPC requests to your Prividium™ RPC while injecting the OAuth
token obtained via a quick browser sign-in.

The proxy CLI is particularly useful for deploying contracts with standard Ethereum tools (like Foundry or Hardhat)
without having to manage authentication manually. The proxy automatically handles authentication headers, allowing you
to use your existing deployment workflows.

### Install & Run

- Use without installing: `npx prividium proxy`
- Or after installing the package (provides the `prividium` binary): `prividium proxy`

### Core Command

```bash
prividium proxy \
  --rpc-url https://<your-prividium-rpc> \
  --user-panel-url https://<your-user-panel> \
  [--port 24101] [--host 127.0.0.1] [--config-path <path>]
```

What happens:

- Prints a local URL to open in your browser for sign-in.
- After successful sign-in, the proxy is available at `http://127.0.0.1:24101/rpc`.
- All requests are forwarded to your `--rpc-url` with `Authorization: Bearer <token>`.
- Requests are rejected until authentication completes.

Flags:

- `--rpc-url, -r` (string): Target Prividium™ RPC URL.
- `--user-panel-url, -u` (string): URL used to log in to Prividium™.
- `--port, -p` (number, default `24101`): Local proxy port. This has to match with the port configured in the admin
  panel, which by default uses this same port.
- `--host, -h` (string, default `127.0.0.1`): host binded to server. By default only connections comming from local
  device will be accepted. WARNING: Using 0.0.0.0 implies allowing anyone in the local network to use your credentials.
- `--config-path, -c` (string): Path to the CLI config file.
- `--unsecure-allow-outside-access`: Needed to expose the proxy to any network (including local network).

Environment variables (optional):

- `PRIVIDIUM_RPC_URL`
- `USER_PANEL_URL`

Precedence: CLI flags > environment variables > saved config file.

### Config Commands

```bash
prividium config set \
  --rpc-url https://<your-prividium-rpc> \
  --user-panel-url https://<your-user-panel>

prividium config print     # Show current values
prividium config path      # Show config file location
prividium config clear     # Delete saved config
```

Notes:

- The config file is stored under your user configuration directory by default (use `config path` to see the exact
  location). You can override with `--config-path`.
- During proxying, the CLI logs incoming JSON-RPC method names.

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## License

MIT
