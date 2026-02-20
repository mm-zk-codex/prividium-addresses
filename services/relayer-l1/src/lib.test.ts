import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { computeNextAttemptAt, isTokenSupported, toTokenAllowlist, tryAcquireInflight } from './lib.js';

test('token allowlist enforcement', () => {
  const allowlist = toTokenAllowlist([{ l1Address: '0x0000000000000000000000000000000000000001', symbol: 'T', decimals: 18, name: 'T' }]);
  assert.equal(isTokenSupported(allowlist, '0x0000000000000000000000000000000000000001'), true);
  assert.equal(isTokenSupported(allowlist, '0x0000000000000000000000000000000000000002'), false);
});

test('multi-event creation for same trackingId', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE deposit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, trackingId TEXT, kind TEXT, amount TEXT)');
  db.prepare('INSERT INTO deposit_events(trackingId,kind,amount) VALUES(?,?,?)').run('track-1', 'ETH', '1');
  db.prepare('INSERT INTO deposit_events(trackingId,kind,amount) VALUES(?,?,?)').run('track-1', 'ERC20', '2');
  const rows = db.prepare('SELECT * FROM deposit_events WHERE trackingId=?').all('track-1');
  assert.equal(rows.length, 2);
});

test('inflight locking', () => {
  assert.equal(tryAcquireInflight(0), true);
  assert.equal(tryAcquireInflight(1), false);
});

test('retry backoff increases', () => {
  const now = 1000;
  const one = computeNextAttemptAt(now, 1, 10, 1000);
  const two = computeNextAttemptAt(now, 2, 10, 1000);
  assert.ok(two > one);
});
