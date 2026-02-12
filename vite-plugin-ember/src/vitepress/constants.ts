/**
 * Vue injection key for providing a default Ember owner to all CodePreview
 * instances. You typically don't need this directly — use `setupEmber()`
 * from `vite-plugin-ember/setup` instead.
 */
export const EMBER_OWNER_KEY = Symbol('ember-owner');
