/**
 * What `<CodePreview>` does on mount, apart from Vue: load the demo module,
 * get the owner, render. Kept separate so it can be tested without a DOM.
 */

import type { Mount, RenderOptions } from 'ember-live-compiler/runtime/render';
import type { EmberOwnerFactory } from './setup.js';

export type OwnerOrFactory = object | EmberOwnerFactory;

// each owner function runs once, whether `setupEmber` or an `owner` prop passed it
const owners = new WeakMap<EmberOwnerFactory, Promise<object>>();

/** The owner itself, or what its function resolves to (retried after a failure). */
export async function resolveOwner(
  ownerOrFactory: OwnerOrFactory | undefined,
): Promise<object | undefined> {
  if (typeof ownerOrFactory !== 'function') return ownerOrFactory;
  // `object` includes functions, so `typeof` can't narrow this on its own
  const factory = ownerOrFactory as EmberOwnerFactory;
  let owner = owners.get(factory);
  if (!owner) {
    owner = Promise.resolve()
      .then(factory)
      .catch((err: unknown) => {
        owners.delete(factory);
        throw err;
      });
    owners.set(factory, owner);
  }
  return owner;
}

export interface MountDemoOptions {
  load(): Promise<unknown>;
  owner?: OwnerOrFactory;
  into: Element;
  render(component: unknown, options: RenderOptions): Promise<Mount>;
  /** Whether the preview went away meanwhile. */
  isUnmounted(): boolean;
}

/**
 * Renders the demo, unless the preview unmounted first. A render that
 * finishes after that is destroyed right away, since nothing else would.
 */
export async function mountDemo(
  options: MountDemoOptions,
): Promise<Mount | undefined> {
  const [component, owner] = await Promise.all([
    options.load(),
    resolveOwner(options.owner),
  ]);
  if (options.isUnmounted()) return undefined;

  const mount = await options.render(component, {
    into: options.into,
    ...(owner ? { owner } : {}),
  });
  if (options.isUnmounted()) {
    mount.destroy();
    return undefined;
  }
  return mount;
}
