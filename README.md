# Live Ember demos — engine + integrations

[![CI](https://github.com/aklkv/vite-plugin-ember/actions/workflows/ci.yml/badge.svg)](https://github.com/aklkv/vite-plugin-ember/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A monorepo for compiling and rendering live `.gjs` / `.gts` [Ember](https://emberjs.com/) components inside docs and preview tools — without standing up a full Ember app.

**[View the live documentation →](https://aklkv.github.io/vite-plugin-ember/)**

## Packages

| Package                                        | npm                                                                                                               | What it does                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ember-live-compiler`](./ember-live-compiler) | [![npm](https://img.shields.io/npm/v/ember-live-compiler.svg)](https://www.npmjs.com/package/ember-live-compiler) | Bundler-agnostic engine. Node `createNodeCompiler()` (Babel + content-tag) and a browser `render()` API. Use it to build your own integration. |
| [`vite-plugin-ember`](./vite-plugin-ember)     | [![npm](https://img.shields.io/npm/v/vite-plugin-ember.svg)](https://www.npmjs.com/package/vite-plugin-ember)     | The reference integration: Vite plugin + VitePress helpers (` ```gjs live ` fences, `<CodePreview>`, `setupEmber`).                            |

The engine is designed to power live Ember demos in any docs/preview stack —
VitePress (shipped), Docusaurus, Storybook, Backstage TechDocs,
[kolay](https://github.com/universal-ember/kolay), `ember-cli-addon-docs`
(planned / community).

## Which package do I want?

- **Writing a VitePress site and want to embed live Ember components** → use
  [`vite-plugin-ember`](./vite-plugin-ember). The README there has the full
  quick-start (install → configure → write a fence).
- **Plain Vite, no VitePress** → `vite-plugin-ember` also works standalone;
  its VitePress helpers live behind separate subpath exports you can ignore.
- **Building a plugin for a different bundler or docs tool** → depend on
  [`ember-live-compiler`](./ember-live-compiler) and wrap its
  `createNodeCompiler()` / `render()` with the bundler-specific glue.
- **You want a full Ember app on Vite** (replacement for `ember-cli` /
  `@embroider/vite`) → not the goal of this project.

## Repository layout

```text
├── ember-live-compiler/   # Bundler-agnostic engine (published to npm)
│   └── src/
│       ├── index.ts                 # Node entry — createNodeCompiler()
│       ├── compile.node.ts          # Babel + content-tag pipeline
│       ├── create-owner.ts          # Map-backed Ember owner
│       ├── runtime/                 # Browser entry — render(), createOwner
│       └── resolver/                # Pure @ember/* resolution helpers
├── vite-plugin-ember/     # Vite plugin + VitePress helpers (published to npm)
│   └── src/
│       ├── index.ts                 # Vite plugin (delegates compile to engine)
│       └── vitepress/               # CodePreview, ember-fence, setupEmber
├── docs/                  # VitePress documentation site (uses both above)
│   ├── demos/             # .gjs/.gts demo components
│   └── guide/             # Documentation pages
├── package.json           # Workspace root (private)
└── pnpm-workspace.yaml
```

## Local development

```sh
pnpm install
pnpm dev        # runs the VitePress docs site against the workspace packages
pnpm build      # builds every workspace package + the docs site
pnpm lint       # lint + format check across workspaces
```

## Requirements

- Node.js ≥ 24
- pnpm ≥ 10

## Releasing

Releases are managed by [`release-plan`](https://github.com/embroider-build/release-plan)
and published via OIDC from `.github/workflows/publish.yml`. See
[RELEASE.md](./RELEASE.md) for the contributor flow.

## License

[MIT](./LICENSE)
