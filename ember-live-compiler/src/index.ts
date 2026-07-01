/**
 * `ember-live-compiler` — Node / build-time entry point.
 *
 * Hosts {@link createNodeCompiler}, the Babel + content-tag pipeline that
 * turns `.gjs` / `.gts` source (and V2-addon `precompileTemplate()` `.js`)
 * into compiled JavaScript modules. Bundler plugins wrap this with their
 * own file-id sniffing and module-resolution logic.
 *
 * Also re-exports the small runtime owner helper so consumers can depend
 * on a single package for both build-time and minimal runtime needs.
 */

export { createNodeCompiler } from './compile.node.js';
export { createOwner } from './create-owner.js';

export type {
  NodeCompiler,
  NodeCompilerOptions,
  CompileFileOptions,
  CompileKind,
  CompileResult,
} from './compile.node.js';
export type { EmberOwner } from './create-owner.js';
export type { PluginItem, PresetItem, ParserOptions } from './compile.node.js';
