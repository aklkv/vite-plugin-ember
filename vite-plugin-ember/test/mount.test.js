/**
 * `<CodePreview>`'s mount sequence: load the demo, get the owner (a function
 * creates it once), render, and destroy renders that finish after unmount.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mountDemo, resolveOwner } from '../dist/vitepress/mount.js';

const component = { name: 'Demo' };

function fakeRender() {
  const calls = [];
  return {
    calls,
    async render(target, options) {
      const mount = { target, options, destroyed: false };
      calls.push(mount);
      return {
        destroy() {
          mount.destroyed = true;
        },
      };
    },
  };
}

test('renders the demo with the owner a function creates, creating it once', async () => {
  const owner = {};
  let created = 0;
  const factory = async () => {
    created++;
    return owner;
  };
  const { calls, render } = fakeRender();
  const options = {
    load: async () => component,
    owner: factory,
    into: {},
    render,
    isUnmounted: () => false,
  };

  await Promise.all([mountDemo(options), mountDemo(options)]);

  assert.equal(created, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].target, component);
  assert.equal(calls[0].options.owner, owner);
});

test("doesn't render when the preview unmounted while loading", async () => {
  let unmounted = false;
  const { calls, render } = fakeRender();

  const mount = await mountDemo({
    load: async () => {
      unmounted = true;
      return component;
    },
    into: {},
    render,
    isUnmounted: () => unmounted,
  });

  assert.equal(mount, undefined);
  assert.equal(calls.length, 0);
});

test('destroys a render that finishes after the preview unmounted', async () => {
  let unmounted = false;
  const { calls, render } = fakeRender();

  const mount = await mountDemo({
    load: async () => component,
    into: {},
    render: async (...args) => {
      const result = await render(...args);
      unmounted = true;
      return result;
    },
    isUnmounted: () => unmounted,
  });

  assert.equal(mount, undefined);
  assert.equal(calls[0].destroyed, true);
});

test('retries an owner function that failed', async () => {
  let calls = 0;
  const factory = () => {
    if (++calls === 1) throw new Error('boot failed');
    return {};
  };

  await assert.rejects(resolveOwner(factory), /boot failed/);
  assert.ok(await resolveOwner(factory));
  assert.equal(calls, 2);
});
