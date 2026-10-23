/**
 * `setupEmber()` provides an owner to every `<CodePreview>`: the built-in
 * one, one passed in, or one a function creates on first use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EMBER_OWNER_KEY, setupEmber } from '../dist/vitepress/setup.js';

function fakeApp() {
  const provided = new Map();
  const components = new Map();
  return {
    provided,
    components,
    provide(key, value) {
      provided.set(key, value);
    },
    component(name, component) {
      components.set(name, component);
    },
  };
}

function fakeOwner() {
  const registrations = [];
  return {
    registrations,
    register(...args) {
      registrations.push(args);
    },
    lookup() {},
  };
}

test('provides the built-in owner with the given services', () => {
  const app = fakeApp();
  const greeting = { hello: 'world' };
  const owner = setupEmber(app, { services: { greeting } });

  assert.equal(app.provided.get(EMBER_OWNER_KEY), owner);
  assert.equal(owner.lookup('service:greeting'), greeting);
  assert.ok(app.components.has('CodePreview'));
});

test('registers services on a given owner as instances', () => {
  const app = fakeApp();
  const owner = fakeOwner();
  const greeting = {};

  assert.equal(setupEmber(app, { owner, services: { greeting } }), owner);
  assert.equal(app.provided.get(EMBER_OWNER_KEY), owner);
  assert.deepEqual(owner.registrations, [
    ['service:greeting', greeting, { instantiate: false }],
  ]);
});

test('creates an owner from a function once, on first use', async () => {
  const app = fakeApp();
  const owner = fakeOwner();
  const greeting = {};
  let calls = 0;

  const result = setupEmber(app, {
    owner: async () => {
      calls++;
      return owner;
    },
    services: { greeting },
  });

  assert.equal(result, undefined);
  assert.equal(calls, 0);

  const lazyOwner = app.provided.get(EMBER_OWNER_KEY);
  assert.equal(typeof lazyOwner, 'function');
  const [first, second] = await Promise.all([lazyOwner(), lazyOwner()]);

  assert.equal(first, owner);
  assert.equal(second, owner);
  assert.equal(calls, 1);
  assert.deepEqual(owner.registrations, [
    ['service:greeting', greeting, { instantiate: false }],
  ]);
});

test('retries an owner function that failed', async () => {
  const app = fakeApp();
  const owner = fakeOwner();
  let calls = 0;

  setupEmber(app, {
    owner: () => {
      if (++calls === 1) throw new Error('boot failed');
      return owner;
    },
  });

  const lazyOwner = app.provided.get(EMBER_OWNER_KEY);
  await assert.rejects(lazyOwner(), /boot failed/);
  assert.equal(await lazyOwner(), owner);
  assert.equal(calls, 2);
});
