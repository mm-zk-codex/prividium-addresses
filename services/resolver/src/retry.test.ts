import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.js';

test('stuck event can be requeued fields', () => {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO aliases(aliasKey, normalizedEmail, suffix, recipientPrividiumAddress, createdAt) VALUES(?,?,?,?,?)').run('a', 'u@example.com', '', '0x0000000000000000000000000000000000000001', Date.now());
  db.prepare('INSERT INTO deposit_requests(trackingId, aliasKey, l1DepositAddressY, l2VaultAddressX, saltY, saltX, createdAt, lastActivityAt, inflightL1, inflightL2, isActive) VALUES(?,?,?,?,?,?,?,?,0,0,1)').run('t','a','y','x','sy','sx',Date.now(),Date.now());
  const id = Number(db.prepare('INSERT INTO deposit_events(trackingId, kind, amount, status, attempts, stuck, nextAttemptAt, createdAt) VALUES(?,?,?,?,?,?,?,?)').run('t','ETH','1','stuck',5,1,100,Date.now()).lastInsertRowid);
  db.prepare("UPDATE deposit_events SET stuck=0, attempts=0, nextAttemptAt=0, status='l1_bridging_submitted' WHERE id=?").run(id);
  const row = db.prepare('SELECT * FROM deposit_events WHERE id=?').get(id) as any;
  assert.equal(row.stuck, 0);
  assert.equal(row.attempts, 0);
  assert.equal(row.status, 'l1_bridging_submitted');
});
