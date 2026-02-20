import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAliasExists } from './alias.js';

test('alias exists resolver logic', () => {
  assert.equal(evaluateAliasExists(true, false, false, true), 'match');
  assert.equal(evaluateAliasExists(false, false, false, true), 'not_found');
  assert.equal(evaluateAliasExists(false, true, false, false), 'match');
  assert.equal(evaluateAliasExists(false, false, true, false), 'maybe_needs_suffix');
  assert.equal(evaluateAliasExists(false, false, false, false), 'not_found');
});
