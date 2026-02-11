# How It Works

This page explains the architecture behind `vite-plugin-ember` — how Ember components compile, resolve, and render inside a VitePress site.

## The challenge

VitePress is built on Vue and Vite. Ember components use a different template syntax (`<template>` tags with Handlebars expressions), decorators (`@tracked`), and their own module namespace (`@ember/*`, `@glimmer/*`). None of this works out of the box in a Vite/Vue environment.

The plugin bridges these two worlds by hooking into Vite's plugin system at every stage of the request lifecycle.

## Architecture overview

````text
┌─────────────────────────────────────────────────────────┐
│  Markdown (.md)                                         │
│  ┌───────────────────────────────────────┐              │
│  │ ```gjs live                           │              │
│  │ <template>Hello!</template>           │  emberFence  │
│  │ ```                                   │──────────────┤
│  └───────────────────────────────────────┘              │
│         │                                               │
│         ▼                                               │
│  <CodePreview src="/@id/virtual:ember-demo-a1b2.gjs" />
│         │                                               │
└─────────┼───────────────────────────────────────────────┘
          │  Browser requests /@id/virtual:ember-demo-a1b2.gjs
          ▼
┌─────────────────────────────────────────────────────────┐
│  vite-plugin-ember (Vite plugin)                        │
│                                                         │
│  1. resolveId  → recognize virtual module ID            │
│  2. load       → return source from demoRegistry        │
│  3. transform  → content-tag → Babel → compiled JS      │
│                                                         │
└─────────────────────────────────────────────────────────┘
          │  Compiled ES module
          ▼
┌─────────────────────────────────────────────────────────┐
│  code-preview.vue                                      │
│                                                         │
│  import(src)  → gets compiled component                 │
│  @ember/renderer → renderComponent(Comp, { into: el })  │
│                                                         │
└─────────────────────────────────────────────────────────┘
````

## Step-by-step flow

### 1. Markdown parsing (build time)

When VitePress processes a markdown file, the `emberFence` markdown-it plugin intercepts code fences tagged with `gjs live` or `gts live`. It:

- Hashes the fence body to create a stable virtual module ID (`virtual:ember-demo-<hash>.gjs`)
- Stores the raw source code in a shared `demoRegistry` Map
- Replaces the fence with an `<CodePreview src="/@id/virtual:ember-demo-<hash>.gjs" />` HTML tag

### 2. Module resolution (request time)

When the browser requests the virtual module, Vite's plugin hooks fire:

- **`resolveId`** recognizes the `virtual:ember-demo-*` pattern and returns it as-is
- **`load`** pulls the raw source from the `demoRegistry`
- **`transform`** compiles it through the two-stage pipeline:
  1. **content-tag** — converts `<template>` tags into JavaScript
  2. **Babel** — applies template compilation, decorator transforms, and (for `.gts`) TypeScript stripping

### 3. Ember package resolution

When the compiled code imports from `@ember/component` or `@glimmer/tracking`, the plugin's `resolveId` hook maps these to actual files inside `ember-source/dist/packages/`. Results are cached to avoid repeated filesystem lookups.

The `@embroider/macros` package (which `ember-source` ESM modules import) is shimmed with runtime implementations since there's no Ember build pipeline to evaluate compile-time macros.

### 4. Client-side rendering

The `CodePreview` Vue component:

1. Dynamically imports the compiled module via `import(src)`
2. Imports `renderComponent` from `@ember/renderer`
3. Mounts the Ember component into a `<div>` element
4. Cleans up via `destroy()` when the Vue component unmounts

This means Ember and Vue coexist on the same page — Vue handles the documentation layout, and Ember handles the interactive demos.

## Key design decisions

### Why virtual modules?

Inline code fences don't exist as files on disk. Virtual modules let Vite serve them as if they were real files, with full HMR and transform support.

### Why a shared registry?

The markdown-it plugin runs during markdown parsing (synchronously), but Vite's `load` hook runs later when the browser requests the module. The `demoRegistry` Map bridges this gap — the fence plugin writes to it, the Vite plugin reads from it.

### Why shim `@embroider/macros`?

Ember's ESM packages call functions like `isDevelopingApp()` and `macroCondition()` at import time. In a standard Ember build, these are replaced at compile time by `@embroider/macros`. Since we're not running the full Ember build pipeline, we provide runtime implementations that return sensible defaults.

### Why `content-tag` + Babel (two stages)?

Ember's `<template>` tag syntax is not valid JavaScript — it needs a custom preprocessor (`content-tag`) to convert it first. Then Babel handles template compilation to wire format and decorator transforms. This two-stage approach matches how the Ember ecosystem processes `.gjs`/`.gts` files.
