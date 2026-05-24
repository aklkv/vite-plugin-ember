/**
 * Ambient declaration for `@ember/renderer`.
 *
 * The module is a virtual subpath provided by `ember-source >= 6.8` in the
 * consumer app — it has no on-disk file for the library's type-checker to
 * find. We declare a minimal shape here so `tsc` is happy while the actual
 * implementation is resolved by the host bundler (Vite plugin) at runtime.
 */
declare module '@ember/renderer' {
  export function renderComponent(
    component: unknown,
    options: { into: Element; owner?: object },
  ): { destroy?: () => void } | undefined;
}
