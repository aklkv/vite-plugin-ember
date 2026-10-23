/**
 * Re-exported from `ember-live-compiler/owner` (not `/runtime`, whose browser
 * compiler would pull Babel into the app's dependency graph) to preserve the
 * existing `vite-plugin-ember/owner` subpath import for downstream consumers.
 */
export { createOwner } from 'ember-live-compiler/owner';
export type { EmberOwner } from 'ember-live-compiler/owner';
