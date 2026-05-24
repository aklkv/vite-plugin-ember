# ember-live-compiler

> **Status: 0.0.1 — scaffold only.** The public surface is being extracted from
> [`vite-plugin-ember`](../vite-plugin-ember). Today only `createOwner` is
> implemented; the build-time and runtime compile pipelines land in 0.1.

A bundler-agnostic engine for compiling and rendering `.gjs` / `.gts` Ember
components. It will be the shared core that powers live Ember demos in:

- VitePress (via `vite-plugin-ember`)
- Docusaurus (via `docusaurus-plugin-ember`, planned)
- Storybook (after [storybookjs/storybook#33048](https://github.com/storybookjs/storybook/pull/33048))
- Backstage TechDocs (via a runtime-only addon, planned)
- [kolay](https://github.com/universal-ember/kolay) and `ember-cli-addon-docs` (as a shared dependency, planned)

## Subpath exports

| Import                         | Environment | Purpose                                               |
| ------------------------------ | ----------- | ----------------------------------------------------- |
| `ember-live-compiler`          | Node        | Build-time `compile()` for bundler plugins.           |
| `ember-live-compiler/runtime`  | Browser     | In-browser `compile()` + `render()`.                  |
| `ember-live-compiler/resolver` | Both        | Pure helpers for resolving `@ember/*` / `@glimmer/*`. |

## License

MIT
