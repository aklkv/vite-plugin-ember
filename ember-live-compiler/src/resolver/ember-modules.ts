/**
 * Bare-specifier prefixes that should be resolved into `ember-source`'s
 * `dist/packages/` tree.
 *
 * E.g. `@ember/renderer` → `<ember-source>/dist/packages/@ember/renderer/index.js`.
 */
export const EMBER_PACKAGE_PREFIXES = ['@ember/', '@glimmer/'] as const;

/**
 * Returns `true` when the given bare specifier belongs to one of the
 * Ember-owned package namespaces ({@link EMBER_PACKAGE_PREFIXES}).
 */
export function isEmberSpecifier(id: string): boolean {
  for (const prefix of EMBER_PACKAGE_PREFIXES) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}
