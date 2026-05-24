/**
 * `ember-live-compiler/runtime` — browser-safe entry point.
 *
 * Exports:
 * - `createOwner`            — Map-backed Ember owner factory (no DOM, no Babel).
 * - `render`                 — mount a component module into a DOM element via
 *                              `@ember/renderer` (lazy-imported).
 * - `createBrowserCompiler`  — `compile()` for `.gjs` / `.gts` / precompiled
 *                              templates that runs through `@babel/standalone`
 *                              and `content-tag`'s wasm bundle. Both deps are
 *                              lazy-imported on first compile.
 */

export { createOwner } from '../create-owner.js';
export { render } from './render.js';
export { createBrowserCompiler } from './compile.js';

export type { EmberOwner } from '../create-owner.js';
export type { Mount, RenderOptions } from './render.js';
export type {
  BrowserCompiler,
  BrowserCompilerOptions,
  BrowserCompileFileOptions,
  BrowserCompileResult,
  CompileKind as BrowserCompileKind,
} from './compile.js';
