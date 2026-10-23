/**
 * `ember-live-compiler` — build-time half of the `@embroider/macros` support.
 *
 * The runtime shim (see `resolver/macros-shim.ts`) covers the macros that
 * work as plain functions (`isDevelopingApp()`, `getConfig()`, …), but some
 * can only be done at build time, the way Embroider's Babel plugin does them:
 *
 * - `dependencySatisfies(name, range)` checks the version of a dependency
 *   installed for the calling package.
 * - `macroCondition(…)` with a statically known condition keeps only the
 *   branch it selects, so the other branch's `importSync()` is never bundled.
 * - `importSync('x')` becomes a hoisted `import * as … from 'x'`.
 *
 * V2 addons call these (e.g. `ember-resources`, `ember-style-modifier`), and
 * without this the shim's `importSync()` throws when they load.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

import { transformAsync } from '@babel/core';
import semver from 'semver';

import type { NodePath, PluginObject, types as BabelTypes } from '@babel/core';
import type { CompileResult } from './compile.node.js';

const MACROS_MODULE = '@embroider/macros';

export interface MacrosOptions {
  /**
   * The project's root directory. Like Embroider, `dependencySatisfies()`
   * also counts the `devDependencies` of the package rooted here.
   */
  appRoot?: string;
  /**
   * Whether `importSync(specifier)` from `filename` can be turned into a
   * static import. Calls that can't keep throwing at runtime (the macros
   * shim's behavior) instead of failing the build. Return `undefined` to
   * fall back to Node's resolution from `filename`, the default.
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
    (source.includes('importSync') || source.includes('dependencySatisfies'))
  );
}

/**
 * Evaluates `dependencySatisfies()`, the `macroCondition()` branches it
 * decides and `importSync()` in a plain JavaScript module. Returns `null`
 * when the module doesn't use them.
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
  if (!result?.code) return null;
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

          // 1. `dependencySatisfies('name', 'range')` → `true` / `false`
          program.traverse({
            CallExpression(path) {
              if (!isMacroCall(path, 'dependencySatisfies')) return;
              const [name, range] = path.node.arguments;
              if (!t.isStringLiteral(name) || !t.isStringLiteral(range)) return;
              path.replaceWith(
                t.booleanLiteral(
                  dependencySatisfies(
                    filename,
                    name.value,
                    range.value,
                    options.appRoot,
                  ),
                ),
              );
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
  try {
    createRequire(filename).resolve(specifier);
    return true;
  } catch (err) {
    // the package is there, it just doesn't export this path to `require`
    return (err as { code?: string }).code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  }
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
