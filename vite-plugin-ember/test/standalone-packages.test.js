/**
 * Not every `@ember/*` package is part of ember-source: `@ember/test-waiters`
 * and `@ember/string` are ordinary packages that addons depend on. With pnpm
 * they're only reachable from the addon that depends on them, so the
 * pre-bundled addon has to get them from there, not from the project root;
 * when the app installs them too, its copy is the one everything shares.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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

function writePackage(dir, pkg, files) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(dir, name), source);
  }
}

function writeTestWaiters(dir, marker) {
  writePackage(
    dir,
    { name: '@ember/test-waiters', type: 'module', exports: './index.js' },
    {
      'index.js': `export function buildWaiter(name) { return { name, ${marker}: true }; }\n`,
    },
  );
}

/**
 * An app whose addon depends on `@ember/test-waiters` (in the addon's own
 * node_modules, like pnpm lays it out), and, with `appCopy`, the app too.
 * Returns the code Vite's optimizer wrote for the addon.
 */
async function prebundleAddon(t, { appCopy }) {
  const root = mkdtempSync(join(tmpdir(), 'vite-plugin-ember-standalone-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
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

  const addonDir = join(root, 'node_modules/fake-addon');
  writePackage(
    addonDir,
    {
      name: 'fake-addon',
      type: 'module',
      exports: './index.js',
      dependencies: { '@ember/test-waiters': '*' },
      peerDependencies: { 'ember-source': '*' },
    },
    {
      'index.js': `import { getOwner } from '@ember/application';
import { buildWaiter } from '@ember/test-waiters';
import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';

export const waiter = buildWaiter('fake-addon');
export { getOwner };
export const waiters = macroCondition(dependencySatisfies('ember-source', '*'))
  ? importSync('@ember/test-waiters')
  : null;
`,
    },
  );
  writeTestWaiters(
    join(addonDir, 'node_modules/@ember/test-waiters'),
    'addonCopy',
  );
  if (appCopy) {
    writeTestWaiters(join(root, 'node_modules/@ember/test-waiters'), 'appCopy');
  }

  const server = await createServer({
    root,
    cacheDir: join(root, 'node_modules/.vite'),
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [vitePluginEmber()],
    optimizeDeps: { include: ['fake-addon'] },
  });
  t.after(() => server.close());

  await server.transformRequest('/main.js');
  const bundle = join(root, 'node_modules/.vite/deps/fake-addon.js');
  for (let i = 0; i < 100 && !existsSync(bundle); i++) await sleep(100);
  return { root, server, bundle, code: readFileSync(bundle, 'utf8') };
}

test('pre-bundled addons get standalone @ember/* packages from their own dependencies', async (t) => {
  const { code } = await prebundleAddon(t, { appCopy: false });

  // bundled from the addon's dependency, so nothing is left to resolve from the root
  assert.match(code, /addonCopy/);
  assert.doesNotMatch(code, /["']@ember\/test-waiters["']/);
  // `importSync()` of it resolves at build time too
  assert.doesNotMatch(code, /importSync\(/);
  // ember-source's own modules still go through this plugin
  assert.match(code, /from ["']@ember\/application["']/);
});

test("pre-bundled addons share the app's copy of a standalone @ember/* package", async (t) => {
  const { root, server, bundle, code } = await prebundleAddon(t, {
    appCopy: true,
  });

  // left for the plugin, which resolves it to the app's copy
  assert.match(code, /from ["']@ember\/test-waiters["']/);
  assert.doesNotMatch(code, /addonCopy|appCopy/);
  assert.doesNotMatch(code, /importSync\(/);

  const resolved = await server.pluginContainer.resolveId(
    '@ember/test-waiters',
    bundle,
  );
  assert.equal(
    resolved?.id.split('?')[0],
    realpathSync(join(root, 'node_modules/@ember/test-waiters/index.js')),
  );
});
