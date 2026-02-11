# Getting Started

`vite-plugin-ember` lets you render Ember components inside [VitePress](https://vitepress.dev/) documentation pages. Write `.gjs` or `.gts` code directly in markdown fences and see live, interactive previews.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (or npm/yarn — adjust commands accordingly)

## Installation

### 1. Install dependencies

In your VitePress project, add the plugin and Ember packages:

```sh
pnpm add vite-plugin-ember ember-source @glimmer/component
```

The plugin bundles its own Babel toolchain (`@babel/core`, `content-tag`, `decorator-transforms`, etc.), so you don't need to install those separately.

### 2. Configure Vite

In your `.vitepress/config.ts`, register the Vite plugin and the markdown-it fence plugin:

```ts
import { defineConfig } from 'vitepress';
import vitePluginEmber, { emberFence } from 'vite-plugin-ember';

export default defineConfig({
  vite: {
    plugins: [vitePluginEmber()],
  },
  markdown: {
    config(md) {
      emberFence(md);
    },
  },
});
```

- **`vitePluginEmber()`** — Handles `.gjs` / `.gts` compilation, module resolution for `@ember/*` and `@glimmer/*`, and virtual module serving.
- **`emberFence(md)`** — Converts ` ```gjs live ` fences in markdown into rendered `<EmberPlayground>` components.

### 3. Register the Vue wrapper component

Create a custom VitePress theme that registers the `EmberPlayground` component shipped with the plugin:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import EmberPlayground from 'vite-plugin-ember/components/EmberPlayground.vue';
import type { Theme } from 'vitepress';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('EmberPlayground', EmberPlayground);
  },
} satisfies Theme;
```

The component handles dynamic imports, `@ember/renderer` mounting, error display, and SSR safety out of the box.

### 4. Start the dev server

```sh
pnpm dev
```

You're ready to write live Ember demos in your markdown! See the [Writing Components](./writing-components) guide for the full syntax.

## Project structure

A typical setup looks like this:

```text
docs/
├── .vitepress/
│   ├── config.ts              # Vite + markdown plugin config
│   └── theme/
│       └── index.ts           # Custom theme (imports EmberPlayground from plugin)
├── demos/                     # Optional: file-based .gjs/.gts demos
│   ├── Counter.gts
│   └── Button.gjs
├── guide/
│   └── getting-started.md
├── index.md
└── package.json
packages/
└── vite-plugin-ember/         # The plugin (or installed from npm)
```
