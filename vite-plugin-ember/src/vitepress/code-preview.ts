import {
  defineComponent,
  onMounted,
  onBeforeUnmount,
  ref,
  inject,
  h,
} from 'vue';
import { render } from 'ember-live-compiler/runtime';
import { EMBER_OWNER_KEY } from './constants.js';

import type { Mount } from 'ember-live-compiler/runtime';
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
const CSS = [
  '.ember-playground{padding:12px;border:1px solid var(--vp-c-divider);border-radius:10px}',
  '.ember-playground__error{padding:8px 12px;margin-bottom:8px;border-radius:6px;background:var(--vp-c-danger-soft);color:var(--vp-c-danger-1);font-size:13px;font-family:var(--vp-font-family-mono);white-space:pre-wrap;word-break:break-word}',
  '.ember-playground__show-code{margin-top:12px;border-top:1px solid var(--vp-c-divider)}',
  '.ember-playground__show-code summary{padding:8px 0 4px;cursor:pointer;font-size:13px;color:var(--vp-c-text-2);user-select:none}',
  '.ember-playground__show-code summary:hover{color:var(--vp-c-text-1)}',
  ".ember-playground__show-code div[class*='language-']{margin:0;border-radius:0 0 8px 8px}",
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
    owner: { type: Object },
    preview: { type: Boolean },
    collapsible: { type: Boolean },
  },
  setup(props, { slots }) {
    const injectedOwner = inject<object | undefined>(
      EMBER_OWNER_KEY,
      undefined,
    );
    const mountEl = ref<HTMLDivElement | null>(null);
    const error = ref<string | null>(null);
    let mount: Mount | undefined;

    onMounted(async () => {
      ensureStyle();
      if (!inBrowser || !mountEl.value) return;

      try {
        const mod = await (props.loader
          ? props.loader()
          : import(/* @vite-ignore */ props.src!));

        const owner = props.owner ?? injectedOwner;
        mount = await render(mod, {
          into: mountEl.value,
          ...(owner ? { owner } : {}),
        });
      } catch (err) {
        console.error('[CodePreview] Failed to render:', err);
        error.value = String(err);
      }
    });

    onBeforeUnmount(() => {
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
