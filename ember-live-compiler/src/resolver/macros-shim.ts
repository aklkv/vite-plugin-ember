/**
 * Runtime shim for `@embroider/macros`.
 *
 * `ember-source`'s ESM modules import compile-time helpers from
 * `@embroider/macros` (`isDevelopingApp`, `macroCondition`, …). Outside of
 * the Embroider build pipeline those imports have no implementation, so
 * any bundler that wants to serve ember-source ESM directly must supply
 * runtime versions instead.
 *
 * Bundler plugins typically:
 *   1. resolve `@embroider/macros` to {@link EMBROIDER_MACROS_VIRTUAL_ID}
 *   2. load that id and return {@link EMBROIDER_MACROS_SHIM_SOURCE}
 *
 * The `\0`-prefixed id follows the Rollup / Vite convention for virtual
 * modules. Consumers using other bundlers may pick any unique id.
 */

export const EMBROIDER_MACROS_VIRTUAL_ID = '\0embroider-macros-shim';

export const EMBROIDER_MACROS_SHIM_SOURCE = `
export function isDevelopingApp() { return true; }
export function isTesting() { return false; }
export function macroCondition(condition) { return condition; }
export function dependencySatisfies() { return true; }
export function getOwnConfig() { return {}; }
export function getConfig() { return {}; }
export function importSync(specifier) {
  throw new Error('[embroider-macros shim] importSync is not supported at runtime: ' + specifier);
}
export function getGlobalConfig() { return { isDevelopingApp: true, isTesting: false }; }
`;
