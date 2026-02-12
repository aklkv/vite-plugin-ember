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
   * Default: 'ember-source/dist/ember-template-compiler'
   * The standalone "ember-template-compiler.js" bundle is used because the
   * ESM '@ember/template-compiler' has runtime @embroider/macros calls.
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
  // The loaded template compiler object (passed directly to babel plugin)
  let compilerObj: any;
  // createRequire anchored to the project root — used to resolve node_modules
  let rootRequire: NodeRequire;

  // ── Resolution caches (avoid repeated fs lookups & require.resolve) ──
  const resolveCache = new Map<string, string | null>();
  let decoratorRuntimePath: string | undefined;

  // ── Pre-built babel configs (allocated once, cloned per-transform) ──
  let babelConfigGJS: { plugins: any[]; parserPlugins: any[] };
  let babelConfigGTS: { plugins: any[]; parserPlugins: any[] };

  function buildBabelConfigs() {
    const baseParserPlugins: any[] = [
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
    ];

    const basePlugins: any[] = [
      [templateCompilation as any, { compiler: compilerObj }],
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
   */
  function resolveEmberPackage(id: string): string | null {
    if (resolveCache.has(id)) return resolveCache.get(id)!;

    let resolved: string | null = null;

    if (emberSourcePackagesDir) {
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

    // Fallback: resolve from node_modules (e.g. @glimmer/component@2)
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
      if (!emberSourcePackagesDir) {
        try {
          rootRequire = createRequire(config.root + '/package.json');
          const emberPkg = rootRequire.resolve('ember-source/package.json');
          emberSourcePackagesDir = emberPkg.replace(
            /package\.json$/,
            'dist/packages',
          );

          // Load the standalone template compiler (CJS bundle)
          if (options.compilerPath) {
            compilerObj = rootRequire(options.compilerPath);
          } else {
            compilerObj = rootRequire(
              'ember-source/dist/ember-template-compiler.js',
            );
          }

          // Pre-resolve decorator-transforms runtime (CJS → ESM)
          try {
            const cjsPath = rootRequire.resolve('decorator-transforms/runtime');
            decoratorRuntimePath = cjsPath.replace(
              /runtime\.cjs$/,
              'runtime.js',
            );
          } catch {
            // not installed
          }

          // Build reusable babel config objects now that compiler is loaded
          buildBabelConfigs();
        } catch {
          // ember-source not found
        }
      }
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
          plugins: [[templateCompilation as any, { compiler: compilerObj }]],
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
