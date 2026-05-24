/**
 * Re-exported from `ember-live-compiler/runtime` (the browser-safe subpath
 * that does NOT pull in the Node Babel pipeline) to preserve the existing
 * `vite-plugin-ember/owner` subpath import for downstream consumers.
 */
export { createOwner } from 'ember-live-compiler/runtime';
export type { EmberOwner } from 'ember-live-compiler/runtime';
