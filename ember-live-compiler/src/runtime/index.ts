/**
 * `ember-live-compiler/runtime` — browser entry point.
 *
 * Will host `compile()` (lazy `@babel/standalone` + content-tag wasm) and
 * `render()` (mount a compiled module into a DOM element with an Ember owner).
 *
 * Today it only re-exports the owner helper so the subpath export is real
 * and importable from day one.
 */

export { createOwner } from '../create-owner.js';

export type { EmberOwner } from '../create-owner.js';
