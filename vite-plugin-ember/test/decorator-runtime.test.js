/**
 * Compiled components import `decorator-transforms/runtime`. It's this
 * plugin's dependency, so it resolves even when the project doesn't install
 * it, as with pnpm, which doesn't hoist it into the project.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import vitePluginEmber from '../dist/index.js';

let root;

before(() => {
  // a project with ember-source but without decorator-transforms
  root = mkdtempSync(join(tmpdir(), 'vite-plugin-ember-runtime-'));
  mkdirSync(join(root, 'node_modules'));
  const emberSource = dirname(
    createRequire(import.meta.url).resolve('ember-source/package.json'),
  );
  symlinkSync(emberSource, join(root, 'node_modules/ember-source'), 'dir');
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("resolves decorator-transforms/runtime from the plugin's own dependency", async () => {
  const plugin = vitePluginEmber();
  plugin.configResolved({
    root,
    cacheDir: join(root, 'node_modules/.vite'),
    logger: { error() {} },
  });

  // without a dev server, Vite's resolver has nothing to add
  const resolved = await plugin.resolveId.call(
    { resolve: async () => null },
    'decorator-transforms/runtime',
    join(root, 'demo.gjs'),
  );

  assert.match(resolved, /\/decorator-transforms\/dist\/runtime\.js$/);
});
