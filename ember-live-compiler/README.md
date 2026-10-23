# ember-live-compiler

> Bundler-agnostic engine for compiling and rendering `.gjs` / `.gts` Ember
> components. Extracted from [`vite-plugin-ember`](../vite-plugin-ember) so the
> same core can power live Ember demos in any docs/preview stack.

[![npm](https://img.shields.io/npm/v/ember-live-compiler.svg)](https://www.npmjs.com/package/ember-live-compiler)
[![license](https://img.shields.io/npm/l/ember-live-compiler.svg)](./LICENSE)

## Why

Every "live Ember demo" tool needs the same two pieces: a Babel + content-tag
pipeline at build time, and a minimal owner + renderer at runtime. Until now
those lived inside `vite-plugin-ember`. This package lifts them out so the
ecosystem can share one implementation:

- VitePress — via [`vite-plugin-ember`](../vite-plugin-ember)
- Docusaurus — via `docusaurus-plugin-ember` (planned)
- Storybook — after [storybookjs/storybook#33048](https://github.com/storybookjs/storybook/pull/33048)
- Backstage TechDocs — runtime-only addon (planned)
- [kolay](https://github.com/universal-ember/kolay), `ember-cli-addon-docs` — as a shared dependency (planned)

## Install

```sh
npm install ember-live-compiler
# peer (optional, only needed for runtime/render):
npm install ember-source
```

`ember-source >= 6.8.0` is declared as an optional peer — required only if you
call `render()`, since it dynamically imports `@ember/renderer`.

## Subpath exports

| Import                               | Environment   | Purpose                                                                                  |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| `ember-live-compiler`                | Node          | Build-time `createNodeCompiler()` — Babel + content-tag — and `transformMacros()`.       |
| `ember-live-compiler/runtime`        | Browser       | `createBrowserCompiler()` + `render()` + `createOwner()` — compile and mount in-browser. |
| `ember-live-compiler/runtime/render` | Browser       | Just `render()`, without the browser compiler.                                           |
| `ember-live-compiler/owner`          | Node, Browser | Just `createOwner()`.                                                                    |
| `ember-live-compiler/resolver`       | Node, Browser | Pure helpers for resolving `@ember/*` / `@glimmer/*`.                                    |

## Node — build-time compile

```ts
import { createNodeCompiler } from 'ember-live-compiler';

const compiler = createNodeCompiler({
  // Optional: pass a pre-loaded ember-template-compiler, or a path to one
  templateCompiler: {
    compilerPath: 'ember-source/dist/ember-template-compiler.js',
  },
  babelPlugins: [],
  babelPresets: [],
  parserPlugins: [],
});

const { code, map } = await compiler.compile(source, {
  filename: 'demo.gjs',
  kind: 'gjs', // 'gjs' | 'gts' | 'precompiled-template'
  sourceMaps: true,
});
```

Wrap it in a Vite / Rollup / esbuild / Webpack plugin and you've got Ember SFC
support.

### `@embroider/macros`

The resolver's runtime shim covers the macros that work as plain functions.
`dependencySatisfies()`, the `macroCondition()` branches it decides, and
`importSync()` need a build step, as in Embroider. Pass `macros` to
`createNodeCompiler()` to evaluate them in `.gjs` / `.gts` and
`precompiled-template` files, and use `transformMacros()` for plain JavaScript
such as V2 addons:

```ts
import { createNodeCompiler, transformMacros } from 'ember-live-compiler';

const macros = {
  // the app, whose devDependencies dependencySatisfies() also counts
  appRoot: process.cwd(),
  // importSync() targets only your bundler resolves; undefined = Node resolution
  canResolve: (specifier) =>
    specifier.startsWith('@ember/') ? true : undefined,
};

const compiler = createNodeCompiler({ macros });
const result = await transformMacros(source, { ...macros, filename });
```

`importSync()` calls that don't resolve keep throwing at runtime instead of
failing the build.

## Browser — render

```ts
import { render } from 'ember-live-compiler/runtime/render';
import * as DemoModule from './demo.gjs';

const mount = await render(DemoModule, {
  into: document.getElementById('preview')!,
});

// later
mount.destroy();
```

`render()` lazily imports `@ember/renderer` (Ember 6.8+) so apps that never
call it don't pay the import cost. Import it from `/runtime/render` rather than
`/runtime` when you don't compile in the browser: the browser compiler's lazy
imports are never loaded, but bundlers still resolve (and Vite pre-bundles)
the Babel they reach. The host bundler must be able to resolve
`@ember/*` specifiers — `vite-plugin-ember`'s `resolveId` hook and
`ssr.noExternal` rule already handle this; equivalent wiring is needed for
other bundlers.

## Browser — compile

```ts
import { createBrowserCompiler } from 'ember-live-compiler/runtime';

const compiler = createBrowserCompiler({
  // Required in real browsers — the babel plugin can't resolve ember-source
  // from disk. Pass a pre-loaded compiler module.
  templateCompiler: { compiler: await import('@ember/template-compiler') },
});

const { code, map } = await compiler.compile(source, {
  filename: 'inline.gts',
  kind: 'gts', // 'gjs' | 'gts' | 'precompiled-template'
  sourceMaps: true,
});

// Feed `code` into a blob-URL / dynamic import / `Function(...)` and then
// `render()` the resulting module.
```

Mirrors the Node pipeline (content-tag → Babel with
`babel-plugin-ember-template-compilation` + `decorator-transforms` + optional
`@babel/plugin-transform-typescript`) but runs through `@babel/standalone` so
it can execute in a worker or on the main thread. Every dependency
(`@babel/standalone`, `content-tag`, the babel plugins, the TS transform) is
**lazy-imported on first compile**, so nothing loads until you compile. Apps
that only render should still import `render` from `/runtime/render` and
`createOwner` from `/owner`: bundlers resolve those lazy imports anyway, and
Vite pre-bundles everything they reach.

Consumer checklist:

- Add `@babel/standalone` to your app (declared as an **optional** peer here).
- Ensure your bundler honors `content-tag`'s `browser` export condition (Vite,
  Rollup, webpack 5, esbuild all do by default) — that picks the wasm bundle
  instead of the Node native binding.
- Pre-load `@ember/template-compiler` from your host app and pass it via
  `templateCompiler.compiler`. (`compilerPath` is Node-only.)

## Resolver helpers

For bundler authors who need to wire up `@ember/*` resolution themselves:

```ts
import {
  EMBER_PACKAGE_PREFIXES,
  EMBROIDER_MACROS_VIRTUAL_ID,
  EMBROIDER_MACROS_SHIM_SOURCE,
  isEmberSpecifier,
} from 'ember-live-compiler/resolver';
```

Pure, bundler-free. No I/O, no Babel, safe to import from anywhere.

## Status

`0.2.x` — public but pre-stable. The Node compile pipeline, browser
`createBrowserCompiler()`, and runtime `render()` are all exercised by the
20-test suite (node `--test`) running against ember-source LTS + latest in
CI. Planned for upcoming minors:

- Stable 1.0 once at least one additional bundler integration ships against
  the engine.

## License

MIT
