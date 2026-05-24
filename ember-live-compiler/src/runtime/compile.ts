/**
 * `ember-live-compiler/runtime` — browser-capable `compile()`.
 *
 * Mirrors the Node {@link import('../compile.node.js').createNodeCompiler}
 * pipeline (content-tag preprocess → Babel transform with
 * `babel-plugin-ember-template-compilation` + `decorator-transforms` +
 * optional `@babel/plugin-transform-typescript`) but runs through
 * `@babel/standalone` so it can execute in a browser worker / main thread.
 *
 * Design choices:
 * - **Lazy imports.** `@babel/standalone` and `content-tag` are only loaded
 *   the first time {@link BrowserCompiler.compile} runs, so apps that
 *   only use `render` / `createOwner` don't pay the ~2 MB cost.
 * - **No `compilerPath`.** Path-based template-compiler resolution is
 *   Node-only. Callers must pass a preloaded `templateCompiler.compiler`
 *   module — typically `await import('@ember/template-compiler')` in apps
 *   running ember-source ≥ 6.8.
 * - **Bundler picks the right `content-tag`.** Its package exports map a
 *   `browser` condition to a wasm bundle (`pkg/standalone.js`), so the
 *   same `import('content-tag')` works in both environments when consumer
 *   bundlers honor the condition.
 *
 * Consumer requirements (browser):
 * - Add `@babel/standalone` to the app's dependencies (it is declared as an
 *   **optional** peer here so Node-only / render-only consumers aren't
 *   forced to install it).
 * - Resolve `content-tag` with the `browser` export condition (Vite, Rollup,
 *   webpack 5, esbuild all do this by default).
 *
 * Usage:
 *
 * ```ts
 * import { createBrowserCompiler } from 'ember-live-compiler/runtime';
 *
 * const compiler = createBrowserCompiler({
 *   templateCompiler: { compiler: await import('@ember/template-compiler') },
 * });
 *
 * const { code } = await compiler.compile(source, {
 *   filename: 'inline.gts',
 *   kind: 'gts',
 * });
 * ```
 */

import type { PluginItem } from '@babel/core';

/** @see {@link import('../compile.node.js').CompileKind} */
export type CompileKind = 'gjs' | 'gts' | 'precompiled-template';

export interface BrowserCompilerOptions {
  /**
   * Pre-loaded Ember template compiler module. Required for any non-trivial
   * usage — without it, `babel-plugin-ember-template-compilation` will try
   * to resolve `ember-source` from disk, which won't work in browsers.
   */
  templateCompiler?: { compiler?: unknown };

  /**
   * Extra Babel plugins. Either appended after the built-ins (array form,
   * matches the Node API), or split around them via `{ before, after }`.
   */
  babelPlugins?: PluginItem[] | { before?: PluginItem[]; after?: PluginItem[] };

  /** Extra Babel presets (forwarded as-is). */
  babelPresets?: PluginItem[];
}

export interface BrowserCompileFileOptions {
  filename: string;
  kind: CompileKind;
  sourceMaps?: boolean;
}

export interface BrowserCompileResult {
  code: string;
  map?: unknown;
}

export interface BrowserCompiler {
  compile(
    source: string,
    opts: BrowserCompileFileOptions,
  ): Promise<BrowserCompileResult | null>;
}

// Minimal shape of `@babel/standalone`'s `transformAsync` we rely on. We
// need the async variant because `babel-plugin-ember-template-compilation`
// runs an async pass.
interface BabelStandalone {
  transformAsync(
    code: string,
    opts: {
      filename?: string;
      babelrc?: boolean;
      configFile?: boolean;
      plugins?: PluginItem[];
      presets?: PluginItem[];
      parserOpts?: { sourceType?: 'module' | 'script'; plugins?: unknown[] };
      sourceMaps?: boolean;
    },
  ): Promise<{ code?: string | null; map?: unknown } | null>;
}

type ContentTagModule = typeof import('content-tag');

let babelPromise: Promise<BabelStandalone> | undefined;
function loadBabel(): Promise<BabelStandalone> {
  // Literal specifier so bundlers' import analyzers see it. Consumers that
  // never call `compile()` will not trigger this import.
  babelPromise ??= import(
    '@babel/standalone' as string
  ) as Promise<BabelStandalone>;
  return babelPromise;
}

let contentTagPromise: Promise<ContentTagModule> | undefined;
function loadContentTag(): Promise<ContentTagModule> {
  contentTagPromise ??= import('content-tag');
  return contentTagPromise;
}

let templateCompilationPromise:
  | Promise<typeof import('babel-plugin-ember-template-compilation')>
  | undefined;
function loadTemplateCompilation() {
  templateCompilationPromise ??=
    import('babel-plugin-ember-template-compilation');
  return templateCompilationPromise;
}

let decoratorTransformsPromise:
  | Promise<typeof import('decorator-transforms')>
  | undefined;
function loadDecoratorTransforms() {
  decoratorTransformsPromise ??= import('decorator-transforms');
  return decoratorTransformsPromise;
}

let tsPluginPromise: Promise<unknown> | undefined;
function loadTsPlugin(): Promise<unknown> {
  // `@babel/plugin-transform-typescript` has no published types — we don't
  // touch any of its API beyond passing it through to Babel as a plugin.
  tsPluginPromise ??= import(
    /* @vite-ignore */ '@babel/plugin-transform-typescript' as string
  );
  return tsPluginPromise;
}

const BASE_PARSER_PLUGINS = [
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
] as const;

/**
 * Build a stateful browser compiler. Heavy work (deciding plugin order) is
 * done here so per-file `compile()` calls stay cheap.
 */
export function createBrowserCompiler(
  options: BrowserCompilerOptions = {},
): BrowserCompiler {
  const templateCompilationOpts: Record<string, unknown> = options
    .templateCompiler?.compiler
    ? { compiler: options.templateCompiler.compiler }
    : {};

  let userBefore: PluginItem[] = [];
  let userAfter: PluginItem[] = [];
  if (Array.isArray(options.babelPlugins)) {
    userAfter = options.babelPlugins;
  } else if (options.babelPlugins) {
    userBefore = options.babelPlugins.before ?? [];
    userAfter = options.babelPlugins.after ?? [];
  }

  const presets: PluginItem[] = [...(options.babelPresets ?? [])];

  async function buildPlugins(kind: CompileKind): Promise<PluginItem[]> {
    const [templateCompilation, decoratorTransforms] = await Promise.all([
      loadTemplateCompilation(),
      loadDecoratorTransforms(),
    ]);

    const tc = (templateCompilation.default ??
      templateCompilation) as PluginItem;
    // `decorator-transforms` ships its babel plugin as the default export of
    // its main entry point.
    const dt = ((decoratorTransforms as { default?: unknown }).default ??
      decoratorTransforms) as PluginItem;

    if (kind === 'precompiled-template') {
      return [[tc, templateCompilationOpts]];
    }

    return [
      ...userBefore,
      [tc, templateCompilationOpts],
      [dt, { runtime: { import: 'decorator-transforms/runtime' } }],
      ...userAfter,
    ];
  }

  async function compile(
    source: string,
    opts: BrowserCompileFileOptions,
  ): Promise<BrowserCompileResult | null> {
    const sourceMaps = opts.sourceMaps ?? true;
    const Babel = await loadBabel();
    const plugins = await buildPlugins(opts.kind);

    let input = source;
    if (opts.kind === 'gjs' || opts.kind === 'gts') {
      const { Preprocessor } = await loadContentTag();
      const preprocessor = new Preprocessor();
      const preResult = preprocessor.process(source, {
        filename: opts.filename,
      }) as string | { code: string };
      input = typeof preResult === 'string' ? preResult : preResult.code;
    }

    const parserPlugins: unknown[] =
      opts.kind === 'gts'
        ? [...BASE_PARSER_PLUGINS, 'typescript']
        : [...BASE_PARSER_PLUGINS];

    let allPlugins: PluginItem[] = plugins;
    if (opts.kind === 'gts') {
      const tsPluginMod = await loadTsPlugin();
      const tsPlugin = ((tsPluginMod as { default?: unknown }).default ??
        tsPluginMod) as PluginItem;
      allPlugins = [
        ...plugins,
        [
          tsPlugin,
          {
            allExtensions: true,
            onlyRemoveTypeImports: true,
            allowDeclareFields: true,
          },
        ],
      ];
    }

    const result = await Babel.transformAsync(input, {
      filename: opts.filename,
      babelrc: false,
      configFile: false,
      plugins: allPlugins,
      presets,
      parserOpts: { sourceType: 'module', plugins: parserPlugins },
      sourceMaps,
    });

    if (!result?.code) return null;
    return { code: result.code, map: result.map ?? undefined };
  }

  return { compile };
}
