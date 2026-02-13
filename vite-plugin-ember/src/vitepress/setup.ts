import { defineAsyncComponent } from 'vue';
import type { App } from 'vue';
import { EMBER_OWNER_KEY } from './constants.js';
import { createOwner } from './create-owner.js';
import type { EmberOwner, FactoryManager } from './create-owner.js';

export type { EmberOwner, FactoryManager };
export { createOwner, EMBER_OWNER_KEY };

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
   * A pre-built owner to use instead of creating one internally.
   * If provided, `services` entries are still registered on it.
   */
  owner?: EmberOwner;

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
 * @returns The owner instance, in case you need to register more services later.
 */
export function setupEmber(
  app: App,
  options: SetupEmberOptions = {},
): EmberOwner {
  const { services, componentName = 'CodePreview' } = options;
  const owner = options.owner ?? createOwner();

  if (services) {
    for (const [name, instance] of Object.entries(services)) {
      owner.register(`service:${name}`, instance);
    }
  }

  const CodePreview = defineAsyncComponent(
    () => import('../../src/vitepress/code-preview.vue'),
  );
  app.component(componentName, CodePreview);
  app.provide(EMBER_OWNER_KEY, owner);

  return owner;
}
