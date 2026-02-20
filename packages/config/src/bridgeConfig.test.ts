import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBridgeConfig } from './bridgeConfig.js';

test('loadBridgeConfig parses and normalizes addresses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-cfg-'));
  const path = join(dir, 'bridge-config.json');
  writeFileSync(path, JSON.stringify({
    l1: { chainId: 1, bridgehub: '0x0000000000000000000000000000000000000001', assetRouter: '0x0000000000000000000000000000000000000002', nativeTokenVault: '0x0000000000000000000000000000000000000003', forwarderFactory: '0x0000000000000000000000000000000000000004' },
    l2: { chainId: 270, vaultFactory: '0x0000000000000000000000000000000000000005' },
    tokens: [{ l1Address: '0x0000000000000000000000000000000000000006', l2Address: '0x0000000000000000000000000000000000000007', symbol: 'T', name: 'Token', decimals: 18, assetId: '0x01' }]
  }));
  const cfg = loadBridgeConfig(path);
  assert.equal(cfg.tokens[0].symbol, 'T');
  assert.equal(cfg.l1.chainId, 1);
});
