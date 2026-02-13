# vite-plugin-ember

[![CI](https://github.com/aklkv/vite-plugin-ember/actions/workflows/ci.yml/badge.svg)](https://github.com/aklkv/vite-plugin-ember/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A [Vite](https://vitejs.dev/) plugin that lets you render live, interactive [Ember](https://emberjs.com/) components inside [VitePress](https://vitepress.dev/) documentation pages.

Write `.gjs` / `.gts` code fences in markdown and see them rendered on the page — no full Ember app required.

**[View the live documentation →](https://aklkv.github.io/vite-plugin-ember/)**

## Features

- **Inline code fences** — use ` ```gjs live ` in markdown for instant interactive previews
- **Preview mode** — add `preview` to show source code alongside the rendered component, or `collapsible` to hide it behind a toggle
- **Full Ember support** — class components, `@tracked` state, `{{on}}` modifier, and TypeScript via `.gts`
- **Zero-config compilation** — content-tag preprocessing, Babel template compilation, decorator transforms, and `@ember/*` / `@glimmer/*` module resolution handled automatically
- **`@embroider/macros` shim** — runtime stubs so `ember-source` ESM imports just work
- **Vue wrapper** — ships a `<CodePreview>` component for seamless VitePress integration

## Quick Start

### 1. Install

Install the plugin along with Ember packages your components need:

```sh
pnpm add vite-plugin-ember ember-source @glimmer/component
```

> **Note:** `ember-source` and `@glimmer/component` are peer dependencies — you manage their versions in your project.

### 2. Configure VitePress

```ts
// .vitepress/config.ts
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

### 3. Register the component

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

### 4. Write a live demo

In any markdown file:

````md
```gjs live
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class Counter extends Component {
  @tracked count = 0;

  increment = () => { this.count += 1; };

  <template>
    <button {{on "click" this.increment}}>
      Clicked {{this.count}} times
    </button>
  </template>
}
```
````

Start the dev server with `pnpm dev` and see it live.

## Documentation

Full docs (built with this plugin!) are in the [`docs/`](./docs) directory. Run locally:

```sh
pnpm install
pnpm dev
```

## Project Structure

````text
├── vite-plugin-ember/   # The Vite plugin (publishable package)
│   └── src/
│       ├── index.ts               # Plugin + Ember compilation pipeline
│       └── vitepress/
│           ├── ember-fence.ts     # markdown-it plugin for ```gjs live fences
│           ├── code-preview.vue   # Vue wrapper component
│           ├── setup.ts           # One-call theme setup helper
│           ├── create-owner.ts    # Minimal Ember owner factory
│           └── constants.ts       # Shared injection keys
├── docs/                # VitePress documentation site
│   ├── demos/           # .gjs/.gts demo components
│   └── guide/           # Documentation pages
├── package.json         # Workspace root
└── pnpm-workspace.yaml
````

## Limitations

Components are rendered standalone via `@ember/renderer`. By default there is **no Ember application container**, which means:

- **`@service` injection** requires calling `setupEmber` with a `services` option (see below)
- **Initializers and instance-initializers** are not executed
- **Routing** (`LinkTo`, `RouterService`) is not available

Components that rely only on `@tracked` state, `@action`, modifiers, and helpers work out of the box.

### Enabling service injection

To support `@service` in your demos, pass a `services` map to `setupEmber`:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { setupEmber } from 'vite-plugin-ember/setup';
import type { Theme } from 'vitepress';
import GreetingService from '../demos/greeting-service';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    setupEmber(app, {
      services: {
        greeting: new GreetingService(),
      },
    });
  },
} satisfies Theme;
```

All `<CodePreview>` instances (including those from ` ```gjs live ` fences) will then use the `@service` decorator for dependency injection.

## Requirements

- Node.js ≥ 20
- pnpm ≥ 10

## License

[MIT](./LICENSE)
