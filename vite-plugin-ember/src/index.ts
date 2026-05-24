import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

import { createNodeCompiler } from 'ember-live-compiler';
import {
  EMBROIDER_MACROS_VIRTUAL_ID,
  EMBROIDER_MACROS_SHIM_SOURCE,
  EMBER_PACKAGE_PREFIXES,
} from 'ember-live-compiler/resolver';

import type { NodeCompiler } from 'ember-live-compiler';
import type { ParserOptions, PluginItem } from '@babel/core';
import type { Plugin, Rollup } from 'vite';

// ── Shared demo registry (populated by ember-fence, read by load hook) ──
export const demoRegistry = new Map<string, string>();

// ── Error narrowing helpers (catch defaults to unknown) ─────────────────
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

// ── Virtual-module helpers (for inline markdown demos) ──────────────────
const PUBLIC_PREFIX = 'virtual:ember-demo-';

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
   *
   * Accepts either an array (appended **after** the built-in template
   * compilation and decorator transform plugins — same as previous behaviour)
   * or an object with `before` / `after` arrays for fine-grained ordering
   * relative to the built-ins:
   *
   * 1. `before` plugins
   * 2. `babel-plugin-ember-template-compilation`
   * 3. `decorator-transforms`
   * 4. `after` plugins
   * 5. `@babel/plugin-transform-typescript` (only for `.gts`)
   *
   * @example
   * ```ts
   * vitePluginEmber({
   *   babelPlugins: ['ember-concurrency/async-arrow-task-transform'],
   * })
   *
   * // or, with explicit ordering:
   * vitePluginEmber({
   *   babelPlugins: {
   *     before: ['my-instrumentation-plugin'],
   *     after: ['ember-concurrency/async-arrow-task-transform'],
   *   },
   * })
   * ```
   */
  babelPlugins?: PluginItem[] | { before?: PluginItem[]; after?: PluginItem[] };

  /**
   * Additional Babel presets to apply during .gjs/.gts transformation.
   * Presets are passed through to Babel as-is and run after plugins,
   * following Babel's normal preset ordering (last to first).
   *
   * @example
   * ```ts
   * vitePluginEmber({
   *   babelPresets: [['@babel/preset-env', { targets: { esmodules: true } }]],
   * })
   * ```
   */
  babelPresets?: PluginItem[];

  /**
   * Additional Babel parser plugins (forwarded to `parserOpts.plugins`).
   * Use this to enable syntax features such as legacy decorators,
   * the pipeline operator, or other proposals that are not enabled by
   * default.
   *
   * The built-in parser plugins (class fields/private methods, plus
   * `typescript` for `.gts`) are always included; these are appended.
   *
   * @example
   * ```ts
   * vitePluginEmber({
   *   parserPlugins: ['decorators-legacy'],
   * })
   * ```
   */
  parserPlugins?: NonNullable<ParserOptions['plugins']>;
}

export default function vitePluginEmber(
  options: VitePluginEmberOptions = {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Locate ember-source's dist/packages directory on disk
  let emberSourcePackagesDir: string | undefined;
  // Preloaded template compiler (only available when the legacy CJS bundle
  // ships with the installed ember-source — i.e. Ember ≤ 6.x). For Ember 7+
  // we hand off resolution to babel-plugin-ember-template-compilation by
  // passing `compilerPath` instead.
  let compilerObj: unknown;
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

  // Compile pipeline (built once `configResolved` has located the template
  // compiler so the engine sees the right `compiler` / `compilerPath`).
  let compiler: NodeCompiler | undefined;

  function buildCompiler() {
    compiler = createNodeCompiler({
      templateCompiler: {
        compiler: compilerObj,
        compilerPath: resolvedCompilerPath,
      },
      babelPlugins: options.babelPlugins,
      babelPresets: options.babelPresets,
      parserPlugins: options.parserPlugins,
    });
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

    /* ─── teach Vite's dep optimizer about Ember virtual specifiers ─
     *
     * Vite pre-bundles bare-specifier dependencies with esbuild on a separate
     * pipeline that does NOT invoke Rollup plugin `resolveId` hooks. When a
     * consumer pulls in an Ember addon (e.g. `ember-modifier`) whose built
     * `dist/index.js` imports `@ember/application` / `@ember/modifier` / etc.,
     * esbuild can't resolve those virtual specifiers and aborts with:
     *
     *     ✘ Could not resolve "@ember/application"
     *     [vitepress] error while updating dependencies
     *
     * (see https://github.com/aklkv/vite-plugin-ember/issues/40)
     *
     * Fix: register an esbuild plugin that marks every `@ember/*`,
     * `@glimmer/*`, `@embroider/macros`, and `decorator-transforms/runtime`
     * import as EXTERNAL during dep optimization. Esbuild then preserves
     * those bare specifiers verbatim in the optimized output, and Vite's
     * import-analysis transform — which DOES call this plugin's `resolveId`
     * hook — rewrites them to real on-disk paths at request time. This way
     * we keep a single source of truth for the resolver (no duplicated
     * `@ember/*` → `ember-source/dist/...` logic across two build tools).
     *
     * We also exclude `ember-source` itself from pre-bundling: it ships
     * native ESM, is enormous, and pre-bundling it would just duplicate
     * everything our `resolveId` already serves.
     *
     * SSR has the mirror-image problem. By default Vite externalizes every
     * npm dep for SSR, handing import resolution off to Node's native ESM
     * loader. That loader has no plugin pipeline, so when something in the
     * SSR module graph pulls in (e.g.) `ember-modifier`, Node sees
     * `import { setOwner } from '@ember/application'`, finds no such
     * package on disk, and dies with `ERR_MODULE_NOT_FOUND`. We force
     * every ember-related dep to be bundled by Vite during SSR instead, so
     * this plugin's `resolveId` gets the chance to rewrite the virtual
     * specifiers.
     */
    config() {
      return {
        optimizeDeps: {
          exclude: ['ember-source'],
          esbuildOptions: {
            plugins: [
              {
                name: 'vite-plugin-ember:externalize-virtual-specifiers',
                setup(build: {
                  onResolve: (
                    opts: { filter: RegExp },
                    cb: (args: { path: string }) => {
                      path: string;
                      external: boolean;
                    },
                  ) => void;
                }) {
                  const externalize = (args: { path: string }) => ({
                    path: args.path,
                    external: true,
                  });
                  build.onResolve({ filter: /^@ember\// }, externalize);
                  build.onResolve({ filter: /^@glimmer\// }, externalize);
                  build.onResolve(
                    { filter: /^@embroider\/macros$/ },
                    externalize,
                  );
                  build.onResolve(
                    { filter: /^decorator-transforms\/runtime$/ },
                    externalize,
                  );
                },
              },
            ],
          },
        },
        ssr: {
          noExternal: [
            'ember-source',
            /^ember-[^/]+$/,
            /^@ember\//,
            /^@glimmer\//,
            /^@embroider\//,
            'decorator-transforms',
          ],
        },
      };
    },

    /* ─── locate ember-source from the project root ───────────────── */
    configResolved(config) {
      if (emberSourcePackagesDir) return;

      try {
        rootRequire = createRequire(config.root + '/package.json');
      } catch (err) {
        config.logger.error(
          `[vite-plugin-ember] Unable to create require anchor at ${config.root}: ${errorMessage(err)}`,
        );
        return;
      }

      let emberPkg: string;
      try {
        emberPkg = rootRequire.resolve('ember-source/package.json');
      } catch (err) {
        config.logger.error(
          `[vite-plugin-ember] Could not resolve ember-source from ${config.root}. ` +
            `Add ember-source as a dependency of your project. (${errorMessage(err)})`,
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
        } catch (err) {
          // Only treat ESM / exports-map failures as "defer to the babel plugin".
          // Any other failure (typo, missing module, syntax error, etc.) is a
          // real misconfiguration and should surface immediately rather than
          // being silently deferred to transform time.
          const code = errorCode(err);
          if (
            code === 'ERR_REQUIRE_ESM' ||
            code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
          ) {
            resolvedCompilerPath = options.compilerPath;
          } else {
            config.logger.error(
              `[vite-plugin-ember] Failed to load compilerPath "${options.compilerPath}": ${errorMessage(err)}`,
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

      buildCompiler();
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
        } catch (err) {
          console.error('[vite-plugin-ember] middleware error:', err);
          next();
        }
      });
    },

    /* ─── resolve virtual modules + @ember/* / @glimmer/* ─────────── */
    resolveId(id) {
      if (id.startsWith('\0')) return null;

      // Shim @embroider/macros with runtime implementations
      if (id === '@embroider/macros') return EMBROIDER_MACROS_VIRTUAL_ID;

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
      if (id === EMBROIDER_MACROS_VIRTUAL_ID)
        return EMBROIDER_MACROS_SHIM_SOURCE;
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
      if (!compiler) return null;

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
        const result = await compiler.compile(code, {
          filename: bareId,
          kind: 'precompiled-template',
        });
        if (!result) return null;
        return { code: result.code, map: result.map as Rollup.SourceMapInput };
      }

      if (!isGJS && !isGTS) return null;

      try {
        const result = await compiler.compile(code, {
          filename: bareId,
          kind: isGTS ? 'gts' : 'gjs',
        });
        if (!result) return null;
        return { code: result.code, map: result.map as Rollup.SourceMapInput };
      } catch (err) {
        this.error(
          `[vite-plugin-ember] compile failed for ${bareId}: ${errorMessage(err)}`,
        );
        return null;
      }
    },
  } satisfies Plugin;
}

// ── Re-exports for VitePress markdown integration ───────────────────────
export { emberFence } from './vitepress/ember-fence.js';
