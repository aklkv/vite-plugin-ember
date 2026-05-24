/**
 * `ember-live-compiler` — Node / build-time compile pipeline.
 *
 * Consumed by bundler plugins (Vite, Webpack, Rollup, esbuild) that need to
 * turn `.gjs` / `.gts` source into a Babel-compiled JavaScript module.
 *
 * The engine is bundler-agnostic and DOM-free: callers are responsible for
 * locating their project's `ember-source` template compiler and for any
 * file-id sniffing / virtual-module bookkeeping their bundler requires.
 *
 * Usage:
 *
 * ```ts
 * import { createNodeCompiler } from 'ember-live-compiler';
 *
 * const compiler = createNodeCompiler({
 *   templateCompiler: { compiler }, // or { compilerPath }
 * });
 *
 * const result = await compiler.compile(source, {
 *   filename: '/abs/path/MyButton.gts',
 *   kind: 'gts',
 *   sourceMaps: true,
 * });
 * ```
 */

import templateCompilation from 'babel-plugin-ember-template-compilation';
import { transformAsync } from '@babel/core';
import { Preprocessor } from 'content-tag';

import type { ParserOptions, PluginItem } from '@babel/core';

type ParserPluginList = NonNullable<ParserOptions['plugins']>;

/**
 * Source kind passed to {@link NodeCompiler.compile}. The consumer is
 * responsible for sniffing this from the file id / extension.
 */
export type CompileKind =
  | 'gjs'
  | 'gts'
  /**
   * A `.js` file emitted by a V2 Ember addon with
   * `targetFormat: 'hbs'` — i.e. it contains `precompileTemplate()` calls
   * that need template-compilation but no content-tag preprocessing and
   * no decorator transform.
   */
  | 'precompiled-template';

/**
 * Options passed once to {@link createNodeCompiler}. Heavy work (building the
 * Babel plugin/preset lists) happens here so per-file `compile()` calls stay
 * cheap.
 */
export interface NodeCompilerOptions {
  /**
   * How `babel-plugin-ember-template-compilation` should locate the Ember
   * template compiler. Pass either a preloaded `compiler` module (fast path
   * for Ember ≤ 6.x) or a `compilerPath` (Ember 7+ ESM, lazily loaded by the
   * Babel plugin). When both are omitted the Babel plugin runs its own
   * default ember-source resolution.
   */
  templateCompiler?: { compiler?: unknown; compilerPath?: string };

  /**
   * Additional Babel plugins. Either an array (appended **after** the
   * built-ins, matching legacy behavior) or `{ before, after }` for fine
   * ordering relative to the built-ins:
   *
   * 1. `before` plugins
   * 2. `babel-plugin-ember-template-compilation`
   * 3. `module:decorator-transforms`
   * 4. `after` plugins
   * 5. `@babel/plugin-transform-typescript` (only for `.gts`)
   */
  babelPlugins?: PluginItem[] | { before?: PluginItem[]; after?: PluginItem[] };

  /** Additional Babel presets (forwarded as-is). */
  babelPresets?: PluginItem[];

  /**
   * Additional Babel parser plugins (forwarded to `parserOpts.plugins`).
   * The built-ins (`classProperties`, `classPrivateProperties`,
   * `classPrivateMethods`, plus `typescript` for `.gts`) are always
   * included; these are appended.
   */
  parserPlugins?: ParserPluginList;
}

/** Per-file options for {@link NodeCompiler.compile}. */
export interface CompileFileOptions {
  /** Absolute path used for source-map `filename` and error reporting. */
  filename: string;
  /** What kind of source this is. */
  kind: CompileKind;
  /** Whether to produce a source map. Defaults to `true`. */
  sourceMaps?: boolean;
}

/** Result of a single compile. */
export interface CompileResult {
  code: string;
  /** Babel's source-map object. Shape matches `BabelFileResult['map']`. */
  map?: unknown;
}

/** Stateful compiler returned by {@link createNodeCompiler}. */
export interface NodeCompiler {
  /**
   * Compile a single source file. Returns `null` when Babel produces no
   * output (matches Vite/Rollup's `transform` contract).
   *
   * Throws on content-tag or Babel failures — the caller is expected to
   * narrow / report those (e.g. via Rollup's `this.error`).
   */
  compile(
    source: string,
    opts: CompileFileOptions,
  ): Promise<CompileResult | null>;
}

const BASE_PARSER_PLUGINS: ParserPluginList = [
  'classProperties',
  'classPrivateProperties',
  'classPrivateMethods',
];

/**
 * Build the shared Babel configs (one for `.gjs`, one for `.gts`,
 * one for `precompiled-template` `.js`) once at compiler-creation time.
 */
export function createNodeCompiler(
  options: NodeCompilerOptions = {},
): NodeCompiler {
  const preprocessor = new Preprocessor();

  const templateCompilationOpts: Record<string, unknown> = (() => {
    const tc = options.templateCompiler;
    if (!tc) return {};
    if (tc.compiler) return { compiler: tc.compiler };
    if (tc.compilerPath) return { compilerPath: tc.compilerPath };
    return {};
  })();

  // Normalize `babelPlugins` (array | { before, after }) into ordered slots
  // around the built-ins.
  let userBefore: PluginItem[] = [];
  let userAfter: PluginItem[] = [];
  if (Array.isArray(options.babelPlugins)) {
    userAfter = options.babelPlugins;
  } else if (options.babelPlugins) {
    userBefore = options.babelPlugins.before ?? [];
    userAfter = options.babelPlugins.after ?? [];
  }

  const basePlugins: PluginItem[] = [
    ...userBefore,
    [templateCompilation as PluginItem, templateCompilationOpts],
    [
      'module:decorator-transforms',
      { runtime: { import: 'decorator-transforms/runtime' } },
    ],
    ...userAfter,
  ];

  const presets: PluginItem[] = [...(options.babelPresets ?? [])];
  const userParserPlugins = options.parserPlugins ?? [];

  const gjsConfig = {
    plugins: basePlugins,
    presets,
    parserPlugins: [...BASE_PARSER_PLUGINS, ...userParserPlugins],
  };

  const gtsConfig = {
    plugins: [
      ...basePlugins,
      [
        '@babel/plugin-transform-typescript',
        {
          allExtensions: true,
          onlyRemoveTypeImports: true,
          allowDeclareFields: true,
        },
      ] satisfies PluginItem,
    ] as PluginItem[],
    presets,
    parserPlugins: [
      ...BASE_PARSER_PLUGINS,
      'typescript' as const,
      ...userParserPlugins,
    ],
  };

  // V2-addon `.js` with precompileTemplate calls: template-compilation only.
  const precompiledTemplatePlugins: PluginItem[] = [
    [templateCompilation as PluginItem, templateCompilationOpts],
  ];

  async function compile(
    source: string,
    opts: CompileFileOptions,
  ): Promise<CompileResult | null> {
    const sourceMaps = opts.sourceMaps ?? true;

    if (opts.kind === 'precompiled-template') {
      const result = await transformAsync(source, {
        filename: opts.filename,
        babelrc: false,
        configFile: false,
        plugins: precompiledTemplatePlugins,
        parserOpts: { sourceType: 'module' },
        sourceMaps,
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map ?? undefined };
    }

    // .gjs / .gts: content-tag preprocessing, then babel.
    const preResult = preprocessor.process(source, {
      filename: opts.filename,
    }) as string | { code: string };
    const preprocessed =
      typeof preResult === 'string' ? preResult : preResult.code;

    const cfg = opts.kind === 'gts' ? gtsConfig : gjsConfig;

    const result = await transformAsync(preprocessed, {
      filename: opts.filename,
      babelrc: false,
      configFile: false,
      plugins: cfg.plugins,
      presets: cfg.presets,
      parserOpts: {
        sourceType: 'module',
        plugins: cfg.parserPlugins,
      },
      sourceMaps,
    });

    if (!result?.code) return null;
    return { code: result.code, map: result.map ?? undefined };
  }

  return { compile };
}

export type { PluginItem, ParserOptions } from '@babel/core';
