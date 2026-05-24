/**
 * Tests for the minimal Map-backed `createOwner()` exported from the
 * package root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOwner } from '../dist/index.js';

test('createOwner returns an object with register/lookup', () => {
  const owner = createOwner();
  assert.equal(typeof owner.register, 'function');
  assert.equal(typeof owner.lookup, 'function');
});

test('lookup returns previously registered instance', () => {
  const owner = createOwner();
  const greeting = { hello: 'world' };
  owner.register('service:greeting', greeting);
  assert.equal(owner.lookup('service:greeting'), greeting);
});

test('lookup returns undefined for unknown full names', () => {
  const owner = createOwner();
  assert.equal(owner.lookup('service:missing'), undefined);
});

test('register overwrites a previous value for the same full name', () => {
  const owner = createOwner();
  owner.register('service:a', 1);
  owner.register('service:a', 2);
  assert.equal(owner.lookup('service:a'), 2);
});

test('owners are isolated from each other', () => {
  const a = createOwner();
  const b = createOwner();
  a.register('service:x', 'a');
  assert.equal(b.lookup('service:x'), undefined);
});
