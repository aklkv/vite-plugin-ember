# Writing Components

There are two ways to include live Ember components in your documentation: **inline code fences** and **file-based demos**.

## Inline code fences

Write Ember components directly in your markdown using fenced code blocks. Add the `live` flag to make them interactive.

### Template-only (GJS)

The simplest demo — just a `<template>` tag:

````md
```gjs live
<template>
  <p>Hello from Ember!</p>
</template>
```
````

This renders the template inline in your page:

```gjs live
<template>
  <p style='color: tomato; font-weight: bold;'>Hello from Ember!</p>
</template>
```

### Class-based components

Import from `@glimmer/component`, `@glimmer/tracking`, and `@ember/modifier` to build stateful components:

````md
```gjs live
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class Counter extends Component {
  @tracked count = 0;

  increment = () => {
    this.count++;
  };

  <template>
    <button type='button' {{on 'click' this.increment}}>
      Clicked:
      {{this.count}}
    </button>
  </template>
}
```
````

```gjs live
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

export default class Counter extends Component {
  @tracked count = 0;

  increment = () => {
    this.count++;
  };

  <template>
    <button
      type='button'
      {{on 'click' this.increment}}
      style='padding: 8px 16px; border-radius: 6px; background: #3498db; color: white; border: none; cursor: pointer; font-size: 14px;'
    >
      Clicked:
      {{this.count}}
    </button>
  </template>
}
```

### TypeScript (GTS)

Use `gts` instead of `gjs` for TypeScript components:

````md
```gts live
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

interface Signature {
  Args: { label?: string };
}

export default class Greeter extends Component<Signature> {
  @tracked name = 'world';

  <template>
    <p>Hello, {{this.name}}!</p>
  </template>
}
```
````

The plugin automatically strips type annotations via `@babel/plugin-transform-typescript`.

## Code fence flags

| Syntax                  | Behavior                                            |
| ----------------------- | --------------------------------------------------- |
| ` ```gjs `              | Static, syntax-highlighted code only                |
| ` ```gjs live `         | Live rendered component                             |
| ` ```gjs live preview ` | Live component **with** source code displayed below |
| ` ```gts live `         | Live TypeScript component                           |
| ` ```gts live preview ` | Live TypeScript component with source code          |

### Preview mode

Adding `preview` shows both the rendered output and the source code:

```gjs live preview
<template>
  <p style='color: seagreen; font-weight: bold;'>
    This component renders above its own source code.
  </p>
</template>
```

## File-based demos

For larger components, keep them in separate `.gjs` / `.gts` files and reference them with the `<CodePreview>` component directly:

```md
<CodePreview src="/demos/counter.gts" />
```

Place demo files in a `demos/` directory (or anywhere under `docs/`). The path is relative to your VitePress root.

<CodePreview src="/demos/counter.gts" />

::: tip
File-based demos are useful when a component is too large for a code fence, or when you want to share the same component across multiple pages.
:::

## Available imports

The plugin resolves these package namespaces automatically — no extra dependencies needed:

| Package                    | Common imports                              |
| -------------------------- | ------------------------------------------- |
| `@glimmer/component`       | `Component` base class                      |
| `@glimmer/tracking`        | `tracked`, `cached`                         |
| `@ember/modifier`          | `on` modifier                               |
| `@ember/helper`            | `fn`, `concat`, `get`, `hash`               |
| `@ember/template-compiler` | (used internally)                           |
| `@ember/renderer`          | `renderComponent` (used by the Vue wrapper) |

Any `@ember/*` or `@glimmer/*` import is resolved from `ember-source`'s ESM packages automatically.

## Custom packages

You can use any npm package installed in your project — just import it in your component code and Vite will resolve it from `node_modules`:

````md
```gjs live
import { TrackedArray } from 'tracked-built-ins';
import Component from '@glimmer/component';
import { on } from '@ember/modifier';

export default class List extends Component {
  items = new TrackedArray(['hello', 'world']);

  add = () => {
    this.items.push('item ' + this.items.length);
  };

  <template>
    <ul>{{#each this.items as |item|}}<li>{{item}}</li>{{/each}}</ul>
    <button type='button' {{on 'click' this.add}}>Add</button>
  </template>
}
```
````

For packages that need special resolution (e.g., mapping a bare specifier to a local file), use the [`resolve` option](/guide/plugin-api#resolve-option).

For addons that ship custom Babel plugins, use the [`babelPlugins` option](/guide/plugin-api#babelplugins-option).

## Styling components

Inline styles work as expected inside `<template>` tags. You can also use standard CSS approaches:

```gjs live
<template>
  <div class='demo-card'>
    <h4>Styled card</h4>
    <p>This uses inline styles for simplicity.</p>
  </div>
  <style>
    .demo-card {
      padding: 16px;
      background: var(--vp-c-bg-soft);
      border-radius: 8px;
      border: 1px solid var(--vp-c-divider);
    }
    .demo-card h4 {
      margin: 0 0 8px;
    }
    .demo-card p {
      margin: 0;
      color: var(--vp-c-text-2);
    }
  </style>
</template>
```

::: warning
`<style>` blocks inside templates are injected globally. Use unique class names to avoid conflicts between demos.
:::
