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

type RendererModule = {
  renderComponent: (
    component: unknown,
    options: { into: Element; owner?: object },
  ) => { destroy?: () => void } | undefined;
};

let rendererPromise: Promise<RendererModule> | undefined;
function loadRenderer(): Promise<RendererModule> {
  // `@ember/renderer` is a virtual subpath provided by ember-source 6.8+ in
  // the consumer app. It does not exist on disk during library type-checking,
  // so we route the import through a variable to keep TS from trying to
  // resolve it. The actual resolution happens in the browser at runtime.
  const specifier = '@ember/renderer';
  rendererPromise ??= import(
    /* @vite-ignore */ specifier
  ) as Promise<RendererModule>;
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
