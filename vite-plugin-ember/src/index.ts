import type { Plugin } from 'vite';
import { transformAsync } from '@babel/core';
import templateCompilation from 'babel-plugin-ember-template-compilation';
import { Preprocessor } from 'content-tag';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

// ── Shared demo registry (populated by ember-fence, read by load hook) ──
export const demoRegistry = new Map<string, string>();

// ── Virtual-module helpers (for inline markdown demos) ──────────────────
const PUBLIC_PREFIX = 'virtual:ember-demo-';

/**
 * Virtual module ID for the @embroider/macros runtime shim.
 * ember-source's ESM modules import from @embroider/macros and call compile-time
 * functions like isDevelopingApp(). Outside of the Ember build pipeline these need
 * runtime implementations instead of throwing.
 */
const EMBROIDER_MACROS_ID = '\0embroider-macros-shim';
const EMBROIDER_MACROS_CODE = `
export function isDevelopingApp() { return true; }
export function isTesting() { return false; }
export function macroCondition(condition) { return condition; }
export function dependencySatisfies() { return true; }
export function getOwnConfig() { return {}; }
export function getConfig() { return {}; }
export function importSync(specifier) {
  throw new Error('[embroider-macros shim] importSync is not supported at runtime: ' + specifier);
}
export function getGlobalConfig() { return { isDevelopingApp: true, isTesting: false }; }
`;

/**
 * Bare-specifier prefixes that should be resolved into ember-source's
 * dist/packages tree.  E.g. `@ember/renderer` →
 * `<ember-source>/dist/packages/@ember/renderer/index.js`
 */
const EMBER_PACKAGE_PREFIXES = ['@ember/', '@glimmer/'];

export interface VitePluginEmberOptions {
  /**
   * Path to the template compiler module.
   *
   * When omitted, resolution falls back through, in order:
   *   1. `ember-source/dist/ember-template-compiler.js` (Ember ≤ 6.x ships a
   *      self-contained CJS bundle here).
   *   2. `ember-source/ember-template-compiler/index.js` (Ember 7+ via the
   *      `babel-plugin-ember-template-compilation` lazy loader).
   *
   * Set this explicitly to force a particular compiler module.
   */
  compilerPath?: string;

  /**
   * Custom import resolution map. Keys are bare specifiers used in component
   * code, values are the resolved paths or package names.
   *
   * @example
   * ```ts
   * vitePluginEmber({
   *   resolve: {
   *     'my-helpers': './src/helpers/index.js',
   *     'tracked-built-ins': 'tracked-built-ins',
   *   }
   * })
   * ```
   */
  resolve?: Record<string, string>;

  /**
   * Additional Babel plugins to run during .gjs/.gts transformation.
   * These are appended after the built-in template compilation and
   * decorator transform plugins.
   *
   * @example
   * ```ts
   * vitePluginEmber({
   *   babelPlugins: [
   *     'ember-concurrency/async-arrow-task-transform',
   *   ]
   * })
   * ```
   */
  babelPlugins?: any[];
}

export default function vitePluginEmber(
  options: VitePluginEmberOptions = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const preprocessor = new Preprocessor();

  // Locate ember-source's dist/packages directory on disk
  let emberSourcePackagesDir: string | undefined;
  // Preloaded template compiler (only available when the legacy CJS bundle
  // ships with the installed ember-source — i.e. Ember ≤ 6.x). For Ember 7+
  // we hand off resolution to babel-plugin-ember-template-compilation by
  // passing `compilerPath` instead.
  let compilerObj: any;
  // Explicit compiler path forwarded to babel-plugin-ember-template-compilation
  // when we do not (or cannot) preload a compiler object ourselves.
  let resolvedCompilerPath: string | undefined;
  // createRequire anchored to the project root — used to resolve node_modules.
  // Populated in `configResolved`; remains undefined if that hook hasn't run
  // yet or if anchoring fails, so consumers must guard before using it.
  let rootRequire: NodeJS.Require | undefined;

  // ── Resolution caches (avoid repeated fs lookups & require.resolve) ──
  const resolveCache = new Map<string, string | null>();
  let decoratorRuntimePath: string | undefined;

  // ── Pre-built babel configs (allocated once, cloned per-transform) ──
  let babelConfigGJS: { plugins: any[]; parserPlugins: any[] };
  let babelConfigGTS: { plugins: any[]; parserPlugins: any[] };

  // Prefer a preloaded compiler when present (fast path, no async resolve).
  // Otherwise hand a path off to babel-plugin-ember-template-compilation —
  // when neither `compiler` nor `compilerPath` is provided it will try the
  // Ember 7+ ESM path first and fall back to the legacy CJS bundle.
  function getTemplateCompilationOpts(): Record<string, unknown> {
    if (compilerObj) return { compiler: compilerObj };
    if (resolvedCompilerPath) return { compilerPath: resolvedCompilerPath };
    return {};
  }

  function buildBabelConfigs() {
    const baseParserPlugins: any[] = [
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
    ];

    const basePlugins: any[] = [
      [templateCompilation as any, getTemplateCompilationOpts()],
      [
        'module:decorator-transforms',
        { runtime: { import: 'decorator-transforms/runtime' } },
      ],
      ...(options.babelPlugins ?? []),
    ];

    babelConfigGJS = {
      plugins: basePlugins,
      parserPlugins: baseParserPlugins,
    };

    babelConfigGTS = {
      plugins: [
        ...basePlugins,
        [
          '@babel/plugin-transform-typescript',
          {
            allExtensions: true,
            onlyRemoveTypeImports: true,
            allowDeclareFields: true,
          },
        ],
      ],
      parserPlugins: [...baseParserPlugins, 'typescript'],
    };
  }

  /**
   * Look up a bare @ember/* or @glimmer/* specifier.
   * Results are cached to avoid repeated existsSync / require.resolve calls.
   *
   * Strategy (tried in order):
   *   1. ember-source's package `exports` map (`ember-source/<id>`). Works for
   *      Ember 7+, which serves `./dist/prod/packages/*` via its exports.
   *   2. Legacy on-disk lookup under `<ember-source>/dist/packages/...` for
   *      Ember <= 6.x (which didn't expose subpath exports).
   *   3. node_modules fallback for standalone packages such as
   *      `@glimmer/component`.
   */
  function resolveEmberPackage(id: string): string | null {
    if (resolveCache.has(id)) return resolveCache.get(id)!;

    let resolved: string | null = null;

    // 1. ember-source subpath exports (Ember 7+).
    if (rootRequire) {
      for (const candidate of [
        `ember-source/${id}/index.js`,
        `ember-source/${id}.js`,
        `ember-source/${id}`,
      ]) {
        try {
          resolved = rootRequire.resolve(candidate);
          break;
        } catch {
          /* try next candidate */
        }
      }
    }

    // 2. Legacy on-disk layout (Ember <= 6.x).
    if (!resolved && emberSourcePackagesDir) {
      const dirPath = `${emberSourcePackagesDir}/${id}/index.js`;
      if (existsSync(dirPath)) {
        resolved = dirPath;
      } else {
        const filePath = `${emberSourcePackagesDir}/${id}.js`;
        if (existsSync(filePath)) {
          resolved = filePath;
        }
      }
    }

    // 3. Fallback: resolve from node_modules (e.g. @glimmer/component@2)
    if (!resolved && rootRequire) {
      try {
        resolved = rootRequire.resolve(id);
      } catch {
        // not installed
      }
    }

    resolveCache.set(id, resolved);
    return resolved;
  }

  return {
    name: 'vite-plugin-ember',
    enforce: 'pre',

    /* ─── locate ember-source from the project root ───────────────── */
    configResolved(config) {
      if (emberSourcePackagesDir) return;

      try {
        rootRequire = createRequire(config.root + '/package.json');
      } catch (err: any) {
        config.logger.error(
          `[vite-plugin-ember] Unable to create require anchor at ${config.root}: ${err.message}`,
        );
        return;
      }

      let emberPkg: string;
      try {
        emberPkg = rootRequire.resolve('ember-source/package.json');
      } catch (err: any) {
        config.logger.error(
          `[vite-plugin-ember] Could not resolve ember-source from ${config.root}. ` +
            `Add ember-source as a dependency of your project. (${err.message})`,
        );
        return;
      }
      emberSourcePackagesDir = emberPkg.replace(
        /package\.json$/,
        'dist/packages',
      );

      // Resolve the template compiler.
      //  • If the user pinned `compilerPath`, honor it (preload when possible,
      //    otherwise pass it through for the babel plugin to import lazily).
      //  • Else try the legacy self-contained CJS bundle shipped by Ember ≤ 6.x.
      //  • Else defer to babel-plugin-ember-template-compilation, which will
      //    locate the Ember 7+ ESM compiler on its own.
      if (options.compilerPath) {
        try {
          compilerObj = rootRequire(options.compilerPath);
        } catch (err: any) {
          // Only treat ESM / exports-map failures as "defer to the babel plugin".
          // Any other failure (typo, missing module, syntax error, etc.) is a
          // real misconfiguration and should surface immediately rather than
          // being silently deferred to transform time.
          if (
            err?.code === 'ERR_REQUIRE_ESM' ||
            err?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
          ) {
            resolvedCompilerPath = options.compilerPath;
          } else {
            config.logger.error(
              `[vite-plugin-ember] Failed to load compilerPath "${options.compilerPath}": ${err?.message ?? err}`,
            );
            throw err;
          }
        }
      } else {
        try {
          compilerObj = rootRequire(
            'ember-source/dist/ember-template-compiler.js',
          );
        } catch {
          // Ember 7+ removed the legacy bundle. Leave both compilerObj and
          // resolvedCompilerPath undefined so the babel plugin runs its own
          // newer-path → legacy-path fallback at transform time.
        }
      }

      // Pre-resolve decorator-transforms runtime (CJS → ESM)
      try {
        const cjsPath = rootRequire.resolve('decorator-transforms/runtime');
        decoratorRuntimePath = cjsPath.replace(/runtime\.cjs$/, 'runtime.js');
      } catch {
        // not installed
      }

      buildBabelConfigs();
    },

    /* ─── serve virtual modules before VitePress catches them ─────── */
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        // Only intercept virtual ember-demo modules — file-based .gjs/.gts
        // are handled natively by Vite's transform pipeline.
        if (!url.includes('virtual:ember-demo-')) return next();

        try {
          const idMatch = url.match(/(virtual:ember-demo-[^?&]+)/);
          if (!idMatch) return next();

          const result = await server.transformRequest(idMatch[1], {
            ssr: false,
          });
          if (!result) return next();

          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(result.code);
        } catch (err: any) {
          console.error('[vite-plugin-ember] middleware error:', err);
          next();
        }
      });
    },

    /* ─── resolve virtual modules + @ember/* / @glimmer/* ─────────── */
    resolveId(id) {
      if (id.startsWith('\0')) return null;

      // Shim @embroider/macros with runtime implementations
      if (id === '@embroider/macros') return EMBROIDER_MACROS_ID;

      // Resolve decorator-transforms runtime (pre-cached ESM path)
      if (id === 'decorator-transforms/runtime') {
        return decoratorRuntimePath ?? null;
      }

      // Virtual ember-demo modules (with or without /@id/ prefix)
      let stripped = id;
      if (stripped.startsWith('/@id/'))
        stripped = stripped.slice('/@id/'.length);
      const bareStripped = stripped.split('?')[0];
      if (bareStripped.startsWith(PUBLIC_PREFIX)) return bareStripped;

      // Resolve bare @ember/* and @glimmer/* to ember-source dist (cached)
      for (const prefix of EMBER_PACKAGE_PREFIXES) {
        if (id.startsWith(prefix)) {
          return resolveEmberPackage(id);
        }
      }

      // User-provided custom resolution map
      if (options.resolve?.[id]) {
        return options.resolve[id];
      }

      return null;
    },

    /* ─── load virtual module source from registry ────────────────── */
    load(id) {
      if (id === EMBROIDER_MACROS_ID) return EMBROIDER_MACROS_CODE;
      if (!id.startsWith(PUBLIC_PREFIX)) return null;
      return demoRegistry.get(id) ?? null;
    },

    /* ─── HMR: force full reload for Ember-related changes ──────── */
    handleHotUpdate({ file, server }) {
      // Ember components can't be hot-swapped like Vue/React — the
      // renderer keeps internal state that doesn't survive HMR.
      // Force a full page reload for:
      //  • .gjs / .gts component files
      //  • .md files that triggered virtual ember-demo modules
      //    (VitePress HMR re-renders Vue but Ember state is stale)
      if (file.endsWith('.gjs') || file.endsWith('.gts')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }

      if (file.endsWith('.md') && demoRegistry.size > 0) {
        // Clear stale virtual modules so they're re-created from
        // the updated markdown on the next full page load.
        for (const [id] of demoRegistry) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },

    /* ─── transform .gjs / .gts / V2-addon .js files ────────────── */
    async transform(code, id) {
      // Skip ?raw imports — let Vite serve the original source text
      if (id.includes('?raw') || id.includes('&raw')) return null;

      const bareId = id.split('?', 1)[0];
      const isGJS = bareId.endsWith('.gjs');
      const isGTS = bareId.endsWith('.gts');
      const isJS = bareId.endsWith('.js');

      // ── V2 addon support ──────────────────────────────────────────
      // V2 addons published with targetFormat: 'hbs' emit .js files
      // containing precompileTemplate() calls. The consuming app's
      // build is expected to finish compilation. We detect these via a
      // cheap string check and run only the template-compilation
      // Babel plugin (no content-tag or decorator transforms needed).
      if (isJS && code.includes('precompileTemplate')) {
        const result = await transformAsync(code, {
          filename: bareId,
          babelrc: false,
          configFile: false,
          plugins: [[templateCompilation as any, getTemplateCompilationOpts()]],
          parserOpts: { sourceType: 'module' },
          sourceMaps: true,
        });
        if (!result?.code) return null;
        return { code: result.code, map: result.map as any };
      }

      if (!isGJS && !isGTS) return null;

      // ── Step 1: content-tag preprocessing ──
      let preprocessed: string;
      try {
        const result = preprocessor.process(code, { filename: bareId });
        preprocessed =
          typeof result === 'string'
            ? result
            : ((result as any).code ?? result);
      } catch (err: any) {
        this.error(
          `[vite-plugin-ember] content-tag failed for ${bareId}: ${err.message}`,
        );
        return null;
      }

      // ── Step 2: Babel (template compilation + decorators + optional TS) ──
      const cfg = isGTS ? babelConfigGTS : babelConfigGJS;

      const result = await transformAsync(preprocessed, {
        filename: bareId,
        babelrc: false,
        configFile: false,
        plugins: cfg.plugins,
        parserOpts: {
          sourceType: 'module',
          plugins: cfg.parserPlugins,
        },
        sourceMaps: true,
      });

      if (!result?.code) return null;
      return { code: result.code, map: result.map as any };
    },
  } satisfies Plugin;
}

// ── Re-exports for VitePress markdown integration ───────────────────────
export { emberFence } from './vitepress/ember-fence.js';
