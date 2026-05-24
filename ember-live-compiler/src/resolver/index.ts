/**
 * `ember-live-compiler/resolver` — pure bundler-helper utilities.
 *
 * These helpers contain no DOM, no Babel, and no Node-only APIs, so they
 * are safe to import from any environment (build tools, runtime bundlers,
 * tests).
 */

export {
  EMBROIDER_MACROS_VIRTUAL_ID,
  EMBROIDER_MACROS_SHIM_SOURCE,
} from './macros-shim.js';

export { EMBER_PACKAGE_PREFIXES, isEmberSpecifier } from './ember-modules.js';
