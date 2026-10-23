/**
 * `ember-live-compiler` — build-time half of the `@embroider/macros` support.
 *
 * The runtime shim (see `resolver/macros-shim.ts`) covers the macros that
 * work as plain functions (`isDevelopingApp()`, `getConfig()`, …), but some
 * can only be done at build time, the way Embroider's Babel plugin does them:
 *
 * - `dependencySatisfies(name, range)` checks the version of a dependency
 *   installed for the calling package, `appEmberSatisfies(range)` the app's
 *   `ember-source`, and `moduleExists(name)` whether a module resolves.
 * - `macroCondition(…)` with a statically known condition keeps only the
 *   branch it selects, so the other branch's `importSync()` is never bundled.
 * - `importSync('x')` becomes a hoisted `import * as … from 'x'`.
 *
 * V2 addons call these (e.g. `ember-resources`, `tracked-built-ins`,
 * `ember-style-modifier`), and without this the shim's `importSync()` throws
 * when they load.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

import { transformAsync } from '@babel/core';
import semver from 'semver';

import type { NodePath, PluginObject, types as BabelTypes } from '@babel/core';
import type { CompileResult } from './compile.node.js';

const MACROS_MODULE = '@embroider/macros';

// set in Babel's file metadata when the plugin rewrote something
const CHANGED = 'embroiderMacrosChanged';

// the macros this pass evaluates; the runtime shim covers the rest
const BUILD_TIME_MACROS = [
  'importSync',
  'dependencySatisfies',
  'appEmberSatisfies',
  'moduleExists',
];

export interface MacrosOptions {
  /**
   * The project's root directory. `appEmberSatisfies()` checks the
   * `ember-source` it depends on, and like Embroider, `dependencySatisfies()`
   * also counts the `devDependencies` of the package rooted here.
   */
  appRoot?: string;
  /**
   * Whether `importSync(specifier)` from `filename` can be turned into a
   * static import (and what `moduleExists(specifier)` returns). Calls that
   * can't keep throwing at runtime (the macros shim's behavior) instead of
   * failing the build. Return `undefined` to fall back to Node's resolution
   * from `filename`, the default.
   */
  canResolve?: (specifier: string, filename: string) => boolean | undefined;
  /** Which files to transform. Defaults to all of them. */
  include?: (filename: string) => boolean;
}

export interface TransformMacrosOptions extends MacrosOptions {
  /** Absolute path of the module, used to find the package that owns it. */
  filename: string;
  /** Whether to produce a source map. Defaults to `true`. */
  sourceMaps?: boolean;
}

/**
 * Cheap check for whether {@link transformMacros} has anything to do, so
 * callers can skip parsing most modules.
 */
export function needsMacrosTransform(source: string): boolean {
  return (
    source.includes(MACROS_MODULE) &&
    BUILD_TIME_MACROS.some((name) => source.includes(name))
  );
}

/**
 * Evaluates `dependencySatisfies()`, `appEmberSatisfies()`, `moduleExists()`,
 * the `macroCondition()` branches they decide and `importSync()` in a plain
 * JavaScript module. Returns `null` when the module doesn't use them.
 */
export async function transformMacros(
  source: string,
  options: TransformMacrosOptions,
): Promise<CompileResult | null> {
  if (!needsMacrosTransform(source)) return null;
  if (options.include?.(options.filename) === false) return null;

  const result = await transformAsync(source, {
    filename: options.filename,
    babelrc: false,
    configFile: false,
    plugins: [macrosBabelPlugin(options)],
    parserOpts: { sourceType: 'module' },
    sourceMaps: options.sourceMaps ?? true,
  });
  // nothing to evaluate (e.g. only non-literal arguments): keep the original
  const metadata = result?.metadata as Record<string, unknown> | undefined;
  if (!result?.code || !metadata?.[CHANGED]) return null;
  return { code: result.code, map: result.map ?? undefined };
}

/**
 * The Babel plugin behind {@link transformMacros}, for pipelines that
 * already run Babel (like the `.gjs` / `.gts` compiler).
 */
export function macrosBabelPlugin(options: MacrosOptions = {}) {
  const canResolve = (specifier: string, filename: string) =>
    options.canResolve?.(specifier, filename) ??
    nodeCanResolve(specifier, filename);

  return function ({ types: t }: { types: typeof BabelTypes }): PluginObject {
    // `importSync(name)` is a call to the `name` export of `@embroider/macros`,
    // under whatever local name the module imported it as.
    function isMacroCall(
      path: NodePath<BabelTypes.CallExpression>,
      name: string,
    ): boolean {
      const callee = path.get('callee');
      if (!callee.isIdentifier()) return false;
      const binding = path.scope.getBinding(callee.node.name);
      if (!binding?.path.isImportSpecifier()) return false;
      const specifier = binding.path.node;
      const declaration = binding.path.parentPath;
      return (
        declaration?.isImportDeclaration() === true &&
        declaration.node.source.value === MACROS_MODULE &&
        t.isIdentifier(specifier.imported, { name })
      );
    }

    return {
      name: 'ember-live-compiler:embroider-macros',
      visitor: {
        Program(program, state) {
          const filename = state.filename;
          if (!filename || options.include?.(filename) === false) return;
          const changed = () => {
            (state.file.metadata as Record<string, unknown>)[CHANGED] = true;
          };

          // 1. `dependencySatisfies('name', 'range')`, `appEmberSatisfies('range')`
          //    and `moduleExists('name')` → `true` / `false`
          program.traverse({
            CallExpression(path) {
              const args = path.node.arguments;
              let value: boolean | undefined;
              if (isMacroCall(path, 'dependencySatisfies')) {
                const [name, range] = args;
                if (t.isStringLiteral(name) && t.isStringLiteral(range)) {
                  value = dependencySatisfies(
                    filename,
                    name.value,
                    range.value,
                    options.appRoot,
                  );
                }
              } else if (isMacroCall(path, 'appEmberSatisfies')) {
                const [range] = args;
                if (t.isStringLiteral(range)) {
                  value = appEmberSatisfies(range.value, options.appRoot);
                }
              } else if (isMacroCall(path, 'moduleExists')) {
                const [specifier] = args;
                if (t.isStringLiteral(specifier)) {
                  value = canResolve(specifier.value, filename);
                }
              }
              if (value === undefined) return;
              path.replaceWith(t.booleanLiteral(value));
              changed();
            },
          });

          // 2. `macroCondition(…)` with a known value keeps the selected branch.
          //    Unknown values (e.g. `isTesting()`) stay runtime calls.
          program.traverse({
            CallExpression(path) {
              if (!isMacroCall(path, 'macroCondition')) return;
              const [predicate] = path.get('arguments');
              const evaluated = predicate?.evaluate();
              if (!evaluated?.confident) return;
              foldCondition(t, path, Boolean(evaluated.value));
              changed();
            },
          });

          // 3. `importSync('x')` → hoisted `import * as … from 'x'`, wrapped the
          //    same way Embroider does (see @embroider/macros' es-compat2).
          const imports = new Map<string, BabelTypes.Identifier>();
          let esCompat: BabelTypes.Identifier | undefined;
          program.traverse({
            CallExpression(path) {
              if (!isMacroCall(path, 'importSync')) return;
              const [specifier] = path.node.arguments;
              if (!t.isStringLiteral(specifier)) return;
              if (!canResolve(specifier.value, filename)) return;

              let namespace = imports.get(specifier.value);
              if (!namespace) {
                namespace = program.scope.generateUidIdentifier('importSync');
                imports.set(specifier.value, namespace);
              }
              esCompat ??= program.scope.generateUidIdentifier('esCompat');
              path.replaceWith(
                t.callExpression(t.cloneNode(esCompat), [
                  t.cloneNode(namespace),
                ]),
              );
            },
          });

          if (!esCompat) return;
          changed();
          program.unshiftContainer('body', [
            ...[...imports].map(([specifier, namespace]) =>
              t.importDeclaration(
                [t.importNamespaceSpecifier(namespace)],
                t.stringLiteral(specifier),
              ),
            ),
            esCompatHelper(t, esCompat),
          ]);
        },
      },
    };
  };
}

// Replace `macroCondition(…)` (optionally negated with `!`) by the branch it
// selects in an `if`, a ternary or a `&&` / `||` / `??`, or by the literal.
function foldCondition(
  t: typeof BabelTypes,
  call: NodePath<BabelTypes.CallExpression>,
  value: boolean,
) {
  let expression: NodePath = call;
  while (
    expression.parentPath?.isUnaryExpression({ operator: '!' }) &&
    expression.parentPath
  ) {
    value = !value;
    expression = expression.parentPath;
  }

  const parent = expression.parentPath;
  if (
    parent &&
    (parent.isIfStatement() || parent.isConditionalExpression()) &&
    expression.key === 'test'
  ) {
    const branch = value ? parent.node.consequent : parent.node.alternate;
    if (branch) {
      parent.replaceWith(branch);
    } else {
      parent.remove();
    }
  } else if (parent?.isLogicalExpression() && expression.key === 'left') {
    const { operator, right } = parent.node;
    // `true && x` and `false || x` are `x`, every other case is the left side
    const keepsRight =
      (operator === '&&' && value) || (operator === '||' && !value);
    parent.replaceWith(keepsRight ? right : t.booleanLiteral(value));
  } else {
    expression.replaceWith(t.booleanLiteral(value));
  }
}

// `function esCompat(m) { return m?.__esModule ? m : { default: m, ...m }; }`
function esCompatHelper(t: typeof BabelTypes, name: BabelTypes.Identifier) {
  const m = t.identifier('m');
  return t.functionDeclaration(
    t.cloneNode(name),
    [m],
    t.blockStatement([
      t.returnStatement(
        t.conditionalExpression(
          t.optionalMemberExpression(
            t.cloneNode(m),
            t.identifier('__esModule'),
            false,
            true,
          ),
          t.cloneNode(m),
          t.objectExpression([
            t.objectProperty(t.identifier('default'), t.cloneNode(m)),
            t.spreadElement(t.cloneNode(m)),
          ]),
        ),
      ),
    ]),
  );
}

function nodeCanResolve(specifier: string, filename: string): boolean {
  const require = createRequire(filename);
  try {
    require.resolve(specifier);
    return true;
  } catch (err) {
    // `require` conditions miss what only `import` exports (ESM-only packages),
    // so look for the path in the package's exports instead
    if ((err as { code?: string }).code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      return false;
    }
    return exportsForImport(require, specifier);
  }
}

// The conditions a bundler resolves a browser `import` with
const IMPORT_CONDITIONS = new Set([
  'import',
  'module',
  'browser',
  'development',
  'production',
  'default',
]);

function exportsForImport(require: NodeJS.Require, specifier: string): boolean {
  const [, name, subpath = ''] =
    specifier.match(/^((?:@[^/]+\/)?[^/]+)(\/.*)?$/) ?? [];
  if (!name) return false;
  for (const nodeModules of require.resolve.paths(name) ?? []) {
    const packageJson = join(nodeModules, name, 'package.json');
    if (existsSync(packageJson)) {
      const { exports } = JSON.parse(readFileSync(packageJson, 'utf8'));
      return exportTarget(exports, `.${subpath}`) !== undefined;
    }
  }
  return false;
}

// What `exports` maps `subpath` to for an import, or undefined if nothing.
function exportTarget(exports: unknown, subpath: string): unknown {
  if (
    typeof exports !== 'object' ||
    exports === null ||
    Array.isArray(exports)
  ) {
    return subpath === '.' ? conditionalTarget(exports) : undefined;
  }
  const map = exports as Record<string, unknown>;
  if (!Object.keys(map).some((key) => key.startsWith('.'))) {
    return subpath === '.' ? conditionalTarget(map) : undefined;
  }
  if (subpath in map) return conditionalTarget(map[subpath]);

  // the pattern with the longest prefix wins, as in Node
  let best: string | undefined;
  for (const key of Object.keys(map)) {
    const star = key.indexOf('*');
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (
      subpath.startsWith(prefix) &&
      subpath.endsWith(suffix) &&
      subpath.length >= key.length - 1 &&
      (!best || prefix.length > best.indexOf('*'))
    ) {
      best = key;
    }
  }
  return best ? conditionalTarget(map[best]) : undefined;
}

function conditionalTarget(target: unknown): unknown {
  // `null` means the path is deliberately not exported
  if (target === null || target === undefined) return undefined;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) {
    return target.map(conditionalTarget).find((value) => value !== undefined);
  }
  if (typeof target === 'object') {
    for (const [condition, value] of Object.entries(target)) {
      if (!IMPORT_CONDITIONS.has(condition)) continue;
      const resolved = conditionalTarget(value);
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

// ── dependencySatisfies, as @embroider/macros implements it ─────────────

interface PackageInfo {
  root: string;
  json: {
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
}

const ownerCache = new Map<string, PackageInfo | undefined>();

/**
 * Whether the package that owns `filename` depends on `name` (dependencies
 * or peerDependencies, plus devDependencies for the app) and the copy it
 * resolves satisfies `range`, prereleases included.
 */
export function dependencySatisfies(
  filename: string,
  name: string,
  range: string,
  appRoot?: string,
): boolean {
  const owner = ownerOfFile(filename);
  if (!owner) return false;

  const sections: (keyof PackageInfo['json'])[] = [
    'dependencies',
    'peerDependencies',
  ];
  if (appRoot && samePath(owner.root, appRoot)) {
    sections.push('devDependencies');
  }
  const declared = sections.some((section) => {
    const deps = owner.json[section];
    return typeof deps === 'object' && deps !== null && name in deps;
  });
  if (!declared) return false;

  const version = installedVersion(owner.root, name);
  if (!version) return false;
  return semver.satisfies(version, range, { includePrerelease: true });
}

/**
 * Whether the app's `ember-source` satisfies `range`, prereleases included:
 * `appEmberSatisfies()` as @embroider/macros implements it. False without an
 * app, or when the app doesn't depend on `ember-source`.
 */
export function appEmberSatisfies(range: string, appRoot?: string): boolean {
  if (!appRoot) return false;
  return dependencySatisfies(
    join(appRoot, 'package.json'),
    'ember-source',
    range,
    appRoot,
  );
}

function ownerOfFile(filename: string): PackageInfo | undefined {
  let dir = dirname(filename);
  const visited: string[] = [];
  let owner: PackageInfo | undefined;

  while (true) {
    if (ownerCache.has(dir)) {
      owner = ownerCache.get(dir);
      break;
    }
    visited.push(dir);
    // leaving a node_modules folder means leaving the package we were in
    if (basename(dir) === 'node_modules') break;
    const packageJson = join(dir, 'package.json');
    if (existsSync(packageJson)) {
      owner = {
        root: dir,
        json: JSON.parse(readFileSync(packageJson, 'utf8')),
      };
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const path of visited) ownerCache.set(path, owner);
  return owner;
}

function installedVersion(root: string, name: string): string | undefined {
  const lookupPaths =
    createRequire(join(root, 'package.json')).resolve.paths(name) ?? [];
  for (const nodeModules of lookupPaths) {
    const packageJson = join(nodeModules, name, 'package.json');
    if (existsSync(packageJson)) {
      return JSON.parse(readFileSync(packageJson, 'utf8')).version;
    }
  }
  return undefined;
}

function samePath(a: string, b: string): boolean {
  return a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '');
}
