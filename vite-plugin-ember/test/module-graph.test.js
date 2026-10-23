/**
 * The VitePress runtime (`setupEmber`, `<CodePreview>`) must not import the
 * browser compiler. Its dynamic imports of Babel are never loaded, but Vite
 * still pre-bundles everything they reach in dev and resolves it in builds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s*(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

// resolved by the app (Vue) or by vite-plugin-ember (`@ember/*`, `@glimmer/*`)
const EXTERNAL = /^(vue$|@ember\/|@glimmer\/)/;
// only follow imports through our own packages; anything else is a leaf
const OURS = /\/(ember-live-compiler|vite-plugin-ember)\/dist\//;

function moduleGraph(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  if (!OURS.test(entry)) return seen;

  const code = readFileSync(entry, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const [, staticImport, dynamicImport] of code.matchAll(IMPORT)) {
    const specifier = staticImport ?? dynamicImport;
    if (EXTERNAL.test(specifier)) continue;
    moduleGraph(createRequire(entry).resolve(specifier), seen);
  }
  return seen;
}

test('setupEmber and CodePreview stay clear of the browser compiler', () => {
  const graph = [
    ...moduleGraph(join(import.meta.dirname, '../dist/vitepress/setup.js')),
  ];

  assert.ok(graph.some((file) => file.endsWith('/vitepress/code-preview.js')));
  assert.ok(graph.some((file) => file.endsWith('/runtime/render.js')));
  assert.deepEqual(
    graph.filter((file) =>
      /\/runtime\/compile\.js$|\/@babel\/|\/content-tag\//.test(file),
    ),
    [],
  );
});
