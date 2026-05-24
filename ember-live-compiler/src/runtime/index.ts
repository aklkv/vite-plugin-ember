/**
 * `ember-live-compiler/runtime` — browser-safe entry point.
 *
 * Exports:
 * - `createOwner` — Map-backed Ember owner factory (no DOM, no Babel).
 * - `render`     — mount a component module into a DOM element via
 *                  `@ember/renderer` (lazy-imported).
 *
 * Future work: `compile()` (lazy `@babel/standalone` + content-tag wasm) so
 * browsers can also do source → component without a build step.
 */

export { createOwner } from '../create-owner.js';
export { render } from './render.js';

export type { EmberOwner } from '../create-owner.js';
export type { Mount, RenderOptions } from './render.js';
