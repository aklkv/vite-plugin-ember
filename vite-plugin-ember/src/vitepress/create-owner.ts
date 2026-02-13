/**
 * A factory-manager returned by `owner.factoryFor(fullName)`.
 *
 * Matches the interface that Ember's `ResolverImpl`, `@service` decorator,
 * and the helper/modifier/component managers expect.
 */
export interface FactoryManager {
  /** The "class" (constructor or value) behind this registration. */
  class: unknown;
  /** Create (or return) an instance of the registered value. */
  create(options?: Record<string, unknown>): unknown;
}

/**
 * A minimal Ember-compatible owner backed by a simple `Map`.
 *
 * Implements enough of the internal-owner interface to satisfy:
 * - `@service` decorator (`getOwner(this).lookup(...)`)
 * - `ResolverImpl.lookupHelper` / `lookupModifier` (`owner.factoryFor(...)`)
 * - Assertion guards (`owner.hasRegistration(...)`)
 */
export interface EmberOwner {
  /** Register a pre-built instance under a full name (e.g. `'service:greeting'`). */
  register(fullName: string, instance: unknown): void;
  /** Look up a previously registered instance. */
  lookup(fullName: string): unknown;
  /** Return a factory-manager for a registered name, or `undefined` if not found. */
  factoryFor(fullName: string): FactoryManager | undefined;
  /** Whether a value has been registered under the given name. */
  hasRegistration(fullName: string): boolean;
}

/**
 * Create a minimal Ember-compatible "owner" backed by a simple Map.
 *
 * A full Ember app uses an `ApplicationInstance` as the owner, but for
 * standalone `renderComponent` usage this lightweight implementation is
 * enough to satisfy `getOwner(this).lookup(...)`, the `@service`
 * decorator, and Ember's `ResolverImpl` which calls `factoryFor()` and
 * `hasRegistration()` during helper / modifier / component resolution.
 *
 * @example
 * ```ts
 * import { createOwner } from 'vite-plugin-ember/owner';
 *
 * const owner = createOwner();
 * owner.register('service:greeting', new GreetingService());
 * ```
 */
export function createOwner(): EmberOwner {
  const registry = new Map<string, unknown>();

  return {
    register(fullName: string, instance: unknown) {
      registry.set(fullName, instance);
    },

    lookup(fullName: string) {
      return registry.get(fullName);
    },

    factoryFor(fullName: string): FactoryManager | undefined {
      const instance = registry.get(fullName);
      if (instance === undefined && !registry.has(fullName)) return undefined;

      return {
        class:
          instance != null &&
          typeof (instance as Record<string, unknown>).constructor ===
            'function'
            ? (instance as Record<string, unknown>).constructor
            : instance,
        create() {
          // Our registry holds singletons, so just return the instance.
          return instance;
        },
      };
    },

    hasRegistration(fullName: string) {
      return registry.has(fullName);
    },
  };
}
