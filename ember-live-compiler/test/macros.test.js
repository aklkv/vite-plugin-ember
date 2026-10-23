/**
 * Tests for the build-time `@embroider/macros` support
 * (`dependencySatisfies`, `macroCondition`, `importSync`).
 *
 * Each test runs against a throwaway project on disk so
 * `dependencySatisfies()` resolves real `package.json` files.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appEmberSatisfies,
  createNodeCompiler,
  dependencySatisfies,
  needsMacrosTransform,
  transformMacros,
} from '../dist/index.js';

let root;
let addonFile;
let appFile;

function writeJson(path, json) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(json));
}

function writePackage(name, json, files = { 'index.js': 'export {};' }) {
  const dir = join(root, 'node_modules', name);
  writeJson(join(dir, 'package.json'), { name, main: 'index.js', ...json });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'ember-live-compiler-macros-'));
  writeJson(join(root, 'package.json'), {
    name: 'app',
    devDependencies: { 'dev-only': '*', 'ember-source': '*' },
  });
  writePackage('ember-source', { version: '6.12.0' });
  writePackage('helper-pkg', { version: '1.2.0' });
  writePackage('undeclared', { version: '1.0.0' });
  writePackage('dev-only', { version: '2.0.0-beta.1' });
  // exports paths only to `import`, like ESM-only packages
  writePackage('esm-only', {
    version: '1.0.0',
    exports: {
      '.': { import: './index.js' },
      './utils': { import: './utils.js' },
      './features/*': { import: './features/*.js' },
      './features/internal/*': null,
    },
  });
  writePackage('addon', {
    version: '1.0.0',
    dependencies: { 'helper-pkg': '^1.0.0' },
    peerDependencies: { 'ember-source': '*', 'ember-engines': '*' },
    devDependencies: { 'dev-only': '*' },
  });
  mkdirSync(join(root, 'node_modules/addon/dist'));
  addonFile = join(root, 'node_modules/addon/dist/index.js');
  appFile = join(root, 'app.js');
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

// `@ember/*` only exists through the bundler, like in vite-plugin-ember
const canResolve = (specifier, filename) => {
  if (specifier.startsWith('@ember/')) return true;
  try {
    createRequire(filename).resolve(specifier);
    return true;
  } catch {
    return false;
  }
};

async function transform(source, filename = addonFile, options = {}) {
  const result = await transformMacros(source, {
    filename,
    appRoot: root,
    canResolve,
    sourceMaps: false,
    ...options,
  });
  return result?.code;
}

test('needsMacrosTransform only matches modules that use the build-time macros', () => {
  assert.equal(needsMacrosTransform(`import x from 'y';`), false);
  assert.equal(
    needsMacrosTransform(
      `import { isTesting } from '@embroider/macros'; isTesting();`,
    ),
    false,
  );
  assert.equal(
    needsMacrosTransform(
      `import { importSync } from '@embroider/macros'; importSync('x');`,
    ),
    true,
  );
  assert.equal(
    needsMacrosTransform(
      `import { macroCondition, appEmberSatisfies } from '@embroider/macros'; macroCondition(appEmberSatisfies('>=6'));`,
    ),
    true,
  );
});

test('transformMacros returns null for modules without macros', async () => {
  assert.equal(await transform(`export const a = 1;`), undefined);
});

test('keeps the branch dependencySatisfies selects and hoists its importSync', async () => {
  // the pattern ember-resources uses
  const code = await transform(`
    import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';
    export const compatOwner = {};
    if (macroCondition(dependencySatisfies('ember-source', '>=4.12.0'))) {
      compatOwner.getOwner = importSync('@ember/owner').getOwner;
    } else {
      compatOwner.getOwner = importSync('@ember/application').getOwner;
    }
  `);

  assert.match(code, /import \* as _importSync from "@ember\/owner";/);
  assert.doesNotMatch(code, /@ember\/application/);
  assert.doesNotMatch(code, /importSync\(/);
  assert.match(
    code,
    /compatOwner\.getOwner = _esCompat\(_importSync\)\.getOwner/,
  );
  assert.match(code, /function _esCompat\(m\)/);
});

test('drops the importSync of a dependency that is not installed', async () => {
  const code = await transform(`
    import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';
    export const LinkToExternal = macroCondition(dependencySatisfies('ember-engines', '*'))
      ? importSync('ember-engines/components/link-to-external').default
      : null;
  `);

  assert.match(code, /export const LinkToExternal = null;/);
  assert.doesNotMatch(code, /ember-engines/);
});

test('dependencySatisfies follows Embroider: declared dependencies only, prereleases included', () => {
  assert.equal(
    dependencySatisfies(addonFile, 'helper-pkg', '^1.0.0', root),
    true,
  );
  assert.equal(
    dependencySatisfies(addonFile, 'helper-pkg', '^2.0.0', root),
    false,
  );
  // installed, but not a dependency of the addon
  assert.equal(dependencySatisfies(addonFile, 'undeclared', '*', root), false);
  // declared, but not installed
  assert.equal(
    dependencySatisfies(addonFile, 'ember-engines', '*', root),
    false,
  );
  // devDependencies only count for the app
  assert.equal(dependencySatisfies(addonFile, 'dev-only', '*', root), false);
  // a prerelease satisfies `*` only when prereleases count
  assert.equal(dependencySatisfies(appFile, 'dev-only', '*', root), true);
  assert.equal(
    dependencySatisfies(appFile, 'dev-only', '>=2.0.0-alpha', root),
    true,
  );
  assert.equal(
    dependencySatisfies(appFile, 'dev-only', '>=2.0.0-alpha'),
    false,
  );
});

test("appEmberSatisfies checks the app's ember-source", () => {
  assert.equal(appEmberSatisfies('>=6.8.0', root), true);
  assert.equal(appEmberSatisfies('^7.0.0', root), false);
  // no app, no ember-source
  assert.equal(appEmberSatisfies('*'), false);
});

test('keeps the branch appEmberSatisfies selects', async () => {
  // the pattern tracked-built-ins uses
  const code = await transform(`
    import { macroCondition, appEmberSatisfies, importSync } from '@embroider/macros';
    export let trackedArray;
    if (macroCondition(appEmberSatisfies('^6.8.0-beta.1 || >= 6.8.0'))) {
      trackedArray = importSync('@ember/reactive/collections').trackedArray;
    } else {
      trackedArray = importSync('./classic/array.js').default;
    }
  `);

  assert.match(
    code,
    /import \* as _importSync from "@ember\/reactive\/collections";/,
  );
  assert.doesNotMatch(code, /classic\/array/);
  assert.doesNotMatch(code, /appEmberSatisfies\(/);
});

test('moduleExists checks whether a module resolves', async () => {
  const code = await transform(`
    import { macroCondition, moduleExists, importSync } from '@embroider/macros';
    export const helper = macroCondition(moduleExists('helper-pkg')) ? importSync('helper-pkg') : null;
    export const missing = macroCondition(moduleExists('missing-pkg')) ? importSync('missing-pkg') : null;
  `);

  assert.match(code, /import \* as _importSync from "helper-pkg";/);
  assert.match(code, /export const missing = null;/);
  assert.doesNotMatch(code, /missing-pkg/);
});

test('hoists only the paths a package exports to import', async () => {
  const code = await transform(
    `
    import { importSync } from '@embroider/macros';
    export const utils = importSync('esm-only/utils');
    export const feature = importSync('esm-only/features/a');
    export const internal = importSync('esm-only/features/internal/b');
    export const missing = importSync('esm-only/missing');
  `,
    addonFile,
    { canResolve: undefined },
  );

  assert.match(code, /import \* as _importSync from "esm-only\/utils";/);
  assert.match(code, /import \* as _importSync2 from "esm-only\/features\/a";/);
  // not exported, so they keep throwing at runtime instead of failing the build
  assert.match(
    code,
    /internal = importSync\('esm-only\/features\/internal\/b'\)/,
  );
  assert.match(code, /missing = importSync\('esm-only\/missing'\)/);
});

test('follows renamed imports of the macros', async () => {
  const code = await transform(`
    import { importSync as load, macroCondition as when, dependencySatisfies as has } from '@embroider/macros';
    export const helper = when(has('helper-pkg', '^1.0.0')) ? load('helper-pkg') : load('missing-pkg');
  `);

  assert.match(code, /import \* as _importSync from "helper-pkg";/);
  assert.doesNotMatch(code, /missing-pkg/);
});

test('leaves runtime conditions alone and only hoists what resolves', async () => {
  const code = await transform(`
    import { macroCondition, isTesting, importSync } from '@embroider/macros';
    export let helper;
    if (macroCondition(isTesting())) {
      helper = importSync('helper-pkg');
    } else {
      helper = importSync('missing-pkg');
    }
  `);

  assert.match(code, /if \(macroCondition\(isTesting\(\)\)\)/);
  assert.match(code, /import \* as _importSync from "helper-pkg";/);
  // keeps throwing at runtime, as the macros shim does today
  assert.match(code, /helper = importSync\('missing-pkg'\)/);
});

test('folds negated conditions and && / || chains', async () => {
  const code = await transform(`
    import { macroCondition, dependencySatisfies, importSync } from '@embroider/macros';
    export const a = !macroCondition(dependencySatisfies('helper-pkg', '^1.0.0')) && importSync('missing-pkg');
    export const b = macroCondition(dependencySatisfies('helper-pkg', '^2.0.0')) || 'fallback';
    export const c = macroCondition(dependencySatisfies('helper-pkg', '^1.0.0')) && importSync('helper-pkg');
  `);

  assert.match(code, /export const a = false;/);
  assert.match(code, /export const b = 'fallback';/);
  assert.match(code, /export const c = _esCompat\(_importSync\);/);
  assert.doesNotMatch(code, /missing-pkg/);
});

test('resolves importSync specifiers with Node by default', async () => {
  const code = await transform(
    `
    import { importSync } from '@embroider/macros';
    export const helper = importSync('helper-pkg');
    export const owner = importSync('@ember/owner');
  `,
    addonFile,
    { canResolve: undefined },
  );

  assert.match(code, /import \* as _importSync from "helper-pkg";/);
  assert.match(code, /export const owner = importSync\('@ember\/owner'\);/);
});

test('skips files that include() leaves out', async () => {
  const source = `
    import { importSync } from '@embroider/macros';
    export const helper = importSync('helper-pkg');
  `;
  const include = (filename) => !filename.includes('/node_modules/addon/');

  assert.equal(await transform(source, addonFile, { include }), undefined);

  // the Babel plugin skips them too
  const compiler = createNodeCompiler({ macros: { canResolve, include } });
  const result = await compiler.compile(source, {
    filename: addonFile,
    kind: 'precompiled-template',
    sourceMaps: false,
  });
  assert.match(
    result.code,
    /export const helper = importSync\('helper-pkg'\);/,
  );
});

test('imports each specifier once', async () => {
  const code = await transform(`
    import { importSync } from '@embroider/macros';
    export const a = importSync('helper-pkg');
    export const b = importSync('helper-pkg').default;
  `);

  assert.equal(code.match(/from "helper-pkg"/g).length, 1);
});

test('createNodeCompiler runs the macros in .gjs files when enabled', async () => {
  const compiler = createNodeCompiler({
    macros: { appRoot: root, canResolve },
  });
  const result = await compiler.compile(
    `import { importSync } from '@embroider/macros';
const { getOwner } = importSync('@ember/owner');

<template>{{if getOwner "owned"}}</template>
`,
    {
      filename: appFile.replace(/\.js$/, '.gjs'),
      kind: 'gjs',
      sourceMaps: false,
    },
  );

  assert.match(result.code, /import \* as _importSync from "@ember\/owner";/);
  assert.doesNotMatch(result.code, /importSync\(/);
});
