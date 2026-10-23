/**
 * The dev server must give each ember-source module a single URL, whether a
 * module imports it by its `@ember/*` name or by a relative path from inside
 * ember-source. Two URLs mean two module instances, e.g. two `EmberRouter`
 * classes, and `LinkTo` failing its `instanceof EmberRouter` check.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createServer } from 'vite';

import vitePluginEmber from '../dist/index.js';

const root = join(import.meta.dirname, 'fixtures/app');
let cacheDir;
let server;

before(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), 'vite-plugin-ember-cache-'));
  server = await createServer({
    root,
    cacheDir,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    // no file watcher, which would keep the process alive on Vite 5 to 7
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [vitePluginEmber()],
  });
});

after(async () => {
  await server?.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

function importUrls(code) {
  return [...code.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map(
    ([, url]) => url,
  );
}

function findImport(code, path) {
  const url = importUrls(code).find((url) => url.split('?')[0].endsWith(path));
  assert.ok(url, `expected an import of ${path} in:\n${code}`);
  return url;
}

test('@ember/* imports get the same URL as relative imports inside ember-source', async () => {
  const main = await server.transformRequest('/main.js');
  const routerFromApp = findImport(main.code, '/@ember/routing/router.js');
  const application = findImport(main.code, '/@ember/application/index.js');

  // `@ember/application` imports the router as `../routing/router.js`
  const applicationModule = await server.transformRequest(application);
  const routerFromEmber = findImport(
    applicationModule.code,
    '/@ember/routing/router.js',
  );

  assert.equal(routerFromApp, routerFromEmber);
});
