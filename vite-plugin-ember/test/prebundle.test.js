/**
 * Vite's dependency optimizer pre-bundles addons without running plugin
 * transforms (on Vite 8 it converts our esbuild plugin to Rolldown), so check
 * the build-time macros in what it actually writes.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { createServer } from 'vite';

import vitePluginEmber from '../dist/index.js';

let root;
let server;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'vite-plugin-ember-prebundle-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'app', type: 'module' }),
  );
  writeFileSync(join(root, 'main.js'), `export * from 'fake-addon';\n`);

  mkdirSync(join(root, 'node_modules'));
  const emberSource = dirname(
    createRequire(import.meta.url).resolve('ember-source/package.json'),
  );
  symlinkSync(emberSource, join(root, 'node_modules/ember-source'), 'dir');

  // the pattern ember-resources uses
  const addonDir = join(root, 'node_modules/fake-addon');
  mkdirSync(addonDir);
  writeFileSync(
    join(addonDir, 'package.json'),
    JSON.stringify({
      name: 'fake-addon',
      type: 'module',
      exports: './index.js',
      peerDependencies: { 'ember-source': '*' },
    }),
  );
  writeFileSync(
    join(addonDir, 'index.js'),
    `import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';
export const compatOwner = {};
if (macroCondition(dependencySatisfies('ember-source', '>=4.12.0'))) {
  compatOwner.getOwner = importSync('@ember/owner').getOwner;
} else {
  compatOwner.getOwner = importSync('@ember/application').getOwner;
}
`,
  );

  server = await createServer({
    root,
    cacheDir: join(root, 'node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [vitePluginEmber()],
    optimizeDeps: { include: ['fake-addon'] },
  });
});

after(async () => {
  await server?.close();
  rmSync(root, { recursive: true, force: true });
});

test('pre-bundled addons get the build-time macros', async () => {
  await server.transformRequest('/main.js');

  const bundle = join(root, 'node_modules/.vite/deps/fake-addon.js');
  for (let i = 0; i < 100 && !existsSync(bundle); i++) await sleep(100);
  const code = readFileSync(bundle, 'utf8');

  assert.match(code, /from ["']@ember\/owner["']/);
  assert.doesNotMatch(code, /@ember\/application/);
  assert.doesNotMatch(code, /importSync\(/);
});
