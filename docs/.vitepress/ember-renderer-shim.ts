// Local shim for @ember/renderer until ember-source publishes it as a standalone ESM entry.
// We attempt to extract renderComponent off the default Ember export.
import Ember from 'ember';

const rc =
  (Ember as any).renderComponent ||
  (Ember as any).__internalTestRenderComponent;
if (!rc) {
  throw new Error(
    '[ember-renderer-shim] Could not find renderComponent on Ember export',
  );
}

export const renderComponent: (component: any, opts: { into: Element }) => any =
  rc;
export default { renderComponent };
