import test from 'node:test';
import assert from 'node:assert/strict';
import { SiweAuthManager } from './siweAuth.js';

const privateKey = '0x59c6995e998f97a5a0044966f094538c5f6270e8b0aa7d9d0ad2f83f5f0f8a5d' as const;

test('service token is cached in memory', async () => {
  let nonceCalls = 0;
  let loginCalls = 0;

  const fetchFn: typeof fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith('/api/siwe-messages')) {
      nonceCalls += 1;
      return new Response(JSON.stringify({ msg: 'sign-me' }), { status: 200 });
    }
    if (url.endsWith('/api/auth/login/crypto-native')) {
      loginCalls += 1;
      return new Response(JSON.stringify({ token: 'jwt-1', expiresAt: '2999-01-01T00:00:00.000Z' }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  const manager = new SiweAuthManager({
    privateKey,
    chainId: 260,
    proxyRpcUrl: 'http://localhost:8545',
    authBaseUrl: 'http://localhost:8000',
    siweDomain: 'localhost:3000',
    fetchFn
  });

  const h1 = await manager.getAuthHeaders();
  const h2 = await manager.getAuthHeaders();

  assert.equal(h1.Authorization, 'Bearer jwt-1');
  assert.equal(h2.Authorization, 'Bearer jwt-1');
  assert.equal(nonceCalls, 1);
  assert.equal(loginCalls, 1);
});

test('service token is cleared on 401 and re-login succeeds', async () => {
  let loginCalls = 0;

  const fetchFn: typeof fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith('/api/siwe-messages')) {
      return new Response(JSON.stringify({ msg: 'sign-me' }), { status: 200 });
    }
    if (url.endsWith('/api/auth/login/crypto-native')) {
      loginCalls += 1;
      return new Response(JSON.stringify({ token: `jwt-${loginCalls}` }), { status: 200 });
    }
    if (url.endsWith('/api/wallet/authorize-transaction')) {
      if (loginCalls === 1) {
        return new Response('unauthorized', { status: 401 });
      }
      return new Response(JSON.stringify({ message: 'ok' }), { status: 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  const manager = new SiweAuthManager({
    privateKey,
    chainId: 260,
    proxyRpcUrl: 'http://localhost:8545',
    authBaseUrl: 'http://localhost:8000',
    siweDomain: 'localhost:3000',
    fetchFn
  });

  await assert.rejects(() => manager.authorizeTransaction({
    walletAddress: manager.getAddress(),
    contractAddress: '0x0000000000000000000000000000000000000001',
    nonce: 1,
    calldata: '0x'
  }));

  const headers = await manager.getAuthHeaders();
  assert.equal(headers.Authorization, 'Bearer jwt-2');
});
