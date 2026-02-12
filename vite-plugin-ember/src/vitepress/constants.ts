/**
 * Vue injection key for providing a default Ember owner to all CodePreview
 * instances. You typically don't need this directly — use `setupEmber()`
 * from `vite-plugin-ember/setup` instead.
 *
 * Uses `Symbol.for()` so the key is identical across module boundaries
 * (e.g. dist/ vs src/ paths that Vite may load separately).
 */
export const EMBER_OWNER_KEY = Symbol.for('vite-plugin-ember:owner');
