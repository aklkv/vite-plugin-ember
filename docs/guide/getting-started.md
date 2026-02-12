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

> `ember-source` and `@glimmer/component` are **peer dependencies** — the plugin doesn't bundle them, so you install and control their versions in your project.

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
- **`emberFence(md)`** — Converts ` ```gjs live ` fences in markdown into rendered `<CodePreview>` components.

### 3. Register the Vue wrapper component

Create a custom VitePress theme that sets up the Ember integration:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { setupEmber } from 'vite-plugin-ember/setup';
import type { Theme } from 'vitepress';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    setupEmber(app);
  },
} satisfies Theme;
```

`setupEmber` registers the `<CodePreview>` component and wires up an Ember owner so `@service` injection works out of the box. To register services, pass them as options:

```ts
setupEmber(app, {
  services: {
    greeting: new GreetingService(),
  },
});
```

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
│       └── index.ts           # Custom theme (imports CodePreview from plugin)
├── demos/                     # Optional: file-based .gjs/.gts demos
│   ├── counter.gts
│   └── button.gjs
├── guide/
│   └── getting-started.md
├── index.md
└── package.json
packages/
└── vite-plugin-ember/         # The plugin (or installed from npm)
```
