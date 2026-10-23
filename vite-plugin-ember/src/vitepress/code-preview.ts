import {
  defineComponent,
  onMounted,
  onBeforeUnmount,
  ref,
  inject,
  h,
} from 'vue';
// Not `ember-live-compiler/runtime`: its browser compiler would pull Babel
// into the app's dependency graph (and Vite's dep pre-bundling).
import { render } from 'ember-live-compiler/runtime/render';
import { EMBER_OWNER_KEY } from './constants.js';
import { mountDemo } from './mount.js';

import type { Mount } from 'ember-live-compiler/runtime/render';
import type { OwnerOrFactory } from './mount.js';
import type { PropType } from 'vue';

// Inlined to avoid a top-level static import from `vitepress`. The `vitepress`
// package uses conditional exports, and when this module is loaded by Node's
// native ESM loader (e.g. during SSR after Vite externalizes it as an npm dep),
// Node resolves to an entry that does not re-export `inBrowser`, which crashes
// at parse time. The check itself is a one-liner, so we just inline it.
// See https://github.com/aklkv/vite-plugin-ember/issues/40#issuecomment-4517523496
const inBrowser = typeof document !== 'undefined';

export { EMBER_OWNER_KEY };

const STYLE_ID = 'vite-plugin-ember-code-preview';
// Plugin-shipped CSS is intentionally limited to "functional" defaults:
//   • container chrome for `.ember-playground`
//   • error message styling
//   • `<summary>` UX inside the collapsible details (cursor, color, hover)
//
// Aesthetic / layout styling for the source wrappers
// (`.ember-playground__code` for the non-collapsible case and
// `.ember-playground__show-code` for the collapsible case) is left to the
// consumer's theme so that both wrappers can be treated symmetrically.
const CSS = [
  '.ember-playground{padding:12px;border:1px solid var(--vp-c-divider);border-radius:10px}',
  '.ember-playground__error{padding:8px 12px;margin-bottom:8px;border-radius:6px;background:var(--vp-c-danger-soft);color:var(--vp-c-danger-1);font-size:13px;font-family:var(--vp-font-family-mono);white-space:pre-wrap;word-break:break-word}',
  '.ember-playground__show-code summary{padding:8px 0 4px;cursor:pointer;font-size:13px;color:var(--vp-c-text-2);user-select:none}',
  '.ember-playground__show-code summary:hover{color:var(--vp-c-text-1)}',
].join('');

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID))
    return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export default defineComponent({
  name: 'CodePreview',
  props: {
    src: { type: String },
    loader: { type: Function as PropType<() => Promise<unknown>> },
    // an owner, or a function creating it on first use (see `setupEmber`)
    owner: { type: [Object, Function] as PropType<OwnerOrFactory> },
    preview: { type: Boolean },
    collapsible: { type: Boolean },
  },
  setup(props, { slots }) {
    const injectedOwner = inject<OwnerOrFactory | undefined>(
      EMBER_OWNER_KEY,
      undefined,
    );
    const mountEl = ref<HTMLDivElement | null>(null);
    const error = ref<string | null>(null);
    let mount: Mount | undefined;
    let unmounted = false;

    onMounted(async () => {
      ensureStyle();
      if (!inBrowser || !mountEl.value) return;

      try {
        mount = await mountDemo({
          load: () =>
            props.loader
              ? props.loader()
              : import(/* @vite-ignore */ props.src!),
          owner: props.owner ?? injectedOwner,
          into: mountEl.value,
          render,
          isUnmounted: () => unmounted,
        });
      } catch (err) {
        console.error('[CodePreview] Failed to render:', err);
        error.value = String(err);
      }
    });

    onBeforeUnmount(() => {
      unmounted = true;
      mount?.destroy();
      mount = undefined;
    });

    return () => {
      const children = [];

      if (error.value) {
        children.push(
          h('div', { class: 'ember-playground__error' }, error.value),
        );
      }

      children.push(h('div', { ref: mountEl, class: 'vp-raw' }));

      if (slots.default) {
        if (props.collapsible) {
          children.push(
            h('details', { class: 'ember-playground__show-code' }, [
              h('summary', 'Show code'),
              slots.default(),
            ]),
          );
        } else {
          children.push(
            h('div', { class: 'ember-playground__code' }, slots.default()),
          );
        }
      }

      return h('div', { class: 'ember-playground' }, children);
    };
  },
});
