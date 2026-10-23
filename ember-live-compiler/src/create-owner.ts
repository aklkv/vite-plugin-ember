/**
 * A minimal Ember-compatible owner backed by a simple `Map`.
 */
export interface EmberOwner {
  /**
   * Register a pre-built instance under a full name (e.g. `'service:greeting'`).
   * `options` matches Ember's `owner.register()`, so a real Ember owner can
   * take instances with `{ instantiate: false }`; this owner ignores it.
   */
  register(
    fullName: string,
    instance: unknown,
    options?: { instantiate?: boolean; singleton?: boolean },
  ): void;
  /** Look up a previously registered instance. */
  lookup(fullName: string): unknown;
}

/**
 * Create a minimal Ember-compatible "owner" backed by a simple Map.
 *
 * A full Ember app uses an `ApplicationInstance` as the owner, but for
 * standalone `renderComponent` usage this lightweight implementation is
 * enough to satisfy `getOwner(this).lookup(...)` and the `@service`
 * decorator.
 *
 * @example
 * ```ts
 * import { createOwner } from 'ember-live-compiler/owner';
 *
 * const owner = createOwner();
 * owner.register('service:greeting', new GreetingService());
 * ```
 */
export function createOwner(): EmberOwner {
  const services = new Map<string, unknown>();

  return {
    register(fullName: string, instance: unknown) {
      services.set(fullName, instance);
    },

    lookup(fullName: string) {
      return services.get(fullName);
    },
  };
}
