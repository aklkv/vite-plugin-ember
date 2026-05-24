/**
 * `ember-live-compiler/runtime` — browser-safe `render()`.
 *
 * Thin wrapper around `@ember/renderer` (Ember 6.8+) that:
 * - lazily imports the renderer so apps that never call `render()` don't pay
 *   the import cost,
 * - unwraps a module's `default` export when callers pass an ESM namespace
 *   object instead of a component class,
 * - normalizes the disposer into the documented `Mount` shape.
 */

import type { EmberOwner } from '../create-owner.js';

export interface Mount {
  destroy(): void;
}

export interface RenderOptions {
  /** DOM element to mount into. */
  into: Element;
  /** Optional Ember owner. Recommended for services / DI. */
  owner?: EmberOwner | object;
}

type RendererModule = typeof import('@ember/renderer');

let rendererPromise: Promise<RendererModule> | undefined;
function loadRenderer(): Promise<RendererModule> {
  // `@ember/renderer` is a virtual subpath provided by ember-source 6.8+ and
  // resolved by the host bundler (vite-plugin-ember maps `@ember/*` onto
  // `ember-source/dist/...`). The literal specifier is intentional so Vite's
  // import analyzer can see it and pre-bundle the module — wrapping it in a
  // variable would ship the bare specifier to the browser unresolved.
  rendererPromise ??= import('@ember/renderer');
  return rendererPromise;
}

/**
 * Mount an Ember component (or an ESM module whose `default` export is one)
 * into a DOM element. Returns a `Mount` whose `destroy()` tears it down.
 */
export async function render(
  component: unknown,
  options: RenderOptions,
): Promise<Mount> {
  const { renderComponent } = await loadRenderer();
  const target =
    component && typeof component === 'object' && 'default' in component
      ? (component as { default: unknown }).default
      : component;

  const disposer = renderComponent(target, {
    into: options.into,
    ...(options.owner ? { owner: options.owner } : {}),
  });

  return {
    destroy() {
      disposer?.destroy?.();
    },
  };
}
