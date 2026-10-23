import { defineAsyncComponent } from 'vue';
import { EMBER_OWNER_KEY } from './constants.js';
import { createOwner } from './create-owner.js';

import type { App } from 'vue';
import type { EmberOwner } from './create-owner.js';

export type { EmberOwner };
export { createOwner, EMBER_OWNER_KEY };

/** Creates the owner on demand, see {@link SetupEmberOptions.owner}. */
export type EmberOwnerFactory = () => EmberOwner | Promise<EmberOwner>;

export interface SetupEmberOptions {
  /**
   * Services to register on the owner, keyed by name.
   *
   * The key is the service name (without the `service:` prefix).
   *
   * @example
   * ```ts
   * setupEmber(app, {
   *   services: { greeting: new GreetingService() },
   * });
   * ```
   */
  services?: Record<string, unknown>;

  /**
   * The owner to use instead of creating one internally, or a function that
   * creates it. A function is called once, when the first `<CodePreview>`
   * renders in the browser (never during SSR), which suits a real Ember
   * `ApplicationInstance` that has to load and boot Ember first.
   * `services` entries are registered on it either way.
   */
  owner?: EmberOwner | EmberOwnerFactory;

  /**
   * The name to register the `CodePreview` component under.
   * @default 'CodePreview'
   */
  componentName?: string;
}

/**
 * One-call setup for Ember live demos in VitePress.
 *
 * Registers the `<CodePreview>` component and provides an Ember-compatible
 * owner (with optional services) to all instances via Vue's `provide` API.
 *
 * @example
 * ```ts
 * // .vitepress/theme/index.ts
 * import DefaultTheme from 'vitepress/theme';
 * import { setupEmber } from 'vite-plugin-ember/setup';
 * import type { Theme } from 'vitepress';
 *
 * export default {
 *   ...DefaultTheme,
 *   enhanceApp({ app }) {
 *     setupEmber(app, {
 *       services: {
 *         greeting: new GreetingService(),
 *       },
 *     });
 *   },
 * } satisfies Theme;
 * ```
 *
 * @returns The owner instance, in case you need to register more services
 * later. With an `owner` function there's no owner yet, so nothing is returned.
 */
export function setupEmber(
  app: App,
  options: SetupEmberOptions & { owner: EmberOwnerFactory },
): void;
export function setupEmber(
  app: App,
  options?: SetupEmberOptions & { owner?: EmberOwner },
): EmberOwner;
export function setupEmber(
  app: App,
  options: SetupEmberOptions = {},
): EmberOwner | void {
  const { services, componentName = 'CodePreview' } = options;

  const registerServices = (owner: EmberOwner) => {
    for (const [name, instance] of Object.entries(services ?? {})) {
      // `instantiate: false` lets a real Ember owner take the instance as is
      owner.register(`service:${name}`, instance, { instantiate: false });
    }
    return owner;
  };

  const CodePreview = defineAsyncComponent(() => import('./code-preview.js'));
  app.component(componentName, CodePreview);

  if (typeof options.owner === 'function') {
    const factory = options.owner;
    let owner: Promise<EmberOwner> | undefined;
    // shared by every <CodePreview>; a failed attempt is retried by the next one
    const lazyOwner: EmberOwnerFactory = () =>
      (owner ??= Promise.resolve()
        .then(factory)
        .then(registerServices)
        .catch((err: unknown) => {
          owner = undefined;
          throw err;
        }));
    app.provide(EMBER_OWNER_KEY, lazyOwner);
    return;
  }

  const owner = registerServices(options.owner ?? createOwner());
  app.provide(EMBER_OWNER_KEY, owner);
  return owner;
}
