/**
 * V2 addons that call build-time `@embroider/macros` (`importSync()` & co.)
 * get them evaluated both when Vite pre-bundles them in dev (an esbuild
 * plugin) and when Vite transforms them (dev and build).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import vitePluginEmber from '../dist/index.js';

// the pattern ember-resources uses
const ADDON_SOURCE = `import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';
export const compatOwner = {};
if (macroCondition(dependencySatisfies('ember-source', '>=4.12.0'))) {
  compatOwner.getOwner = importSync('@ember/owner').getOwner;
} else {
  compatOwner.getOwner = importSync('@ember/application').getOwner;
}
`;

let root;
let addonFile;
let plugin;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'vite-plugin-ember-macros-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: { 'app-only': '*' } }),
  );
  // the project needs ember-source, so link our devDependency
  mkdirSync(join(root, 'node_modules'));
  const emberSource = dirname(
    createRequire(import.meta.url).resolve('ember-source/package.json'),
  );
  symlinkSync(emberSource, join(root, 'node_modules/ember-source'), 'dir');

  // a dependency only the app has
  mkdirSync(join(root, 'node_modules/app-only'));
  writeFileSync(
    join(root, 'node_modules/app-only/package.json'),
    JSON.stringify({ name: 'app-only', version: '1.0.0' }),
  );

  const addonDir = join(root, 'node_modules/fake-addon');
  mkdirSync(addonDir, { recursive: true });
  writeFileSync(
    join(addonDir, 'package.json'),
    JSON.stringify({
      name: 'fake-addon',
      peerDependencies: { 'ember-source': '*' },
    }),
  );
  addonFile = join(addonDir, 'index.js');
  writeFileSync(addonFile, ADDON_SOURCE);

  plugin = vitePluginEmber();
  plugin.configResolved({
    root,
    cacheDir: join(root, 'node_modules/.vite'),
    logger: { error() {} },
  });
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function assertTransformed(code) {
  assert.match(code, /import \* as _importSync from "@ember\/owner";/);
  assert.doesNotMatch(code, /@ember\/application/);
  assert.doesNotMatch(code, /importSync\(/);
}

function optimizerOnLoad() {
  const { plugins } = plugin.config().optimizeDeps.esbuildOptions;
  const macros = plugins.find(
    ({ name }) => name === 'vite-plugin-ember:embroider-macros',
  );
  let onLoad;
  macros.setup({
    onLoad(_options, callback) {
      onLoad = callback;
    },
  });
  return onLoad;
}

test('dependency pre-bundling evaluates the macros in addon files', async () => {
  const onLoad = optimizerOnLoad();
  const result = await onLoad({ path: addonFile });

  assert.equal(result.loader, 'js');
  assertTransformed(result.contents);
  assert.match(
    result.contents,
    /\/\/# sourceMappingURL=data:application\/json/,
  );
});

test('dependency pre-bundling leaves other files to esbuild', async () => {
  const onLoad = optimizerOnLoad();
  assert.equal(await onLoad({ path: join(root, 'package.json') }), undefined);
  // e.g. a virtual module, which has no file to read
  assert.equal(await onLoad({ path: '\0virtual:module.js' }), undefined);
});

test('transform evaluates the macros in addon files', async () => {
  const result = await plugin.transform.call({}, ADDON_SOURCE, addonFile);
  assertTransformed(result.code);
});

test('transform skips files Vite already pre-bundled', async () => {
  const chunk = join(root, 'node_modules/.vite/deps/chunk.js');
  assert.equal(await plugin.transform.call({}, ADDON_SOURCE, chunk), null);
});

test('inline demos resolve the macros from the project', async () => {
  const result = await plugin.transform.call(
    {
      error(message) {
        throw new Error(message);
      },
    },
    `import { dependencySatisfies } from '@embroider/macros';
export const hasAppOnly = dependencySatisfies('app-only', '*');
`,
    'virtual:ember-demo-macros.gjs',
  );

  assert.match(result.code, /hasAppOnly = true/);
});
