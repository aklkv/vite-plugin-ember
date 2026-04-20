import {
  defineComponent,
  onMounted,
  onBeforeUnmount,
  ref,
  inject,
  h,
  type PropType,
} from 'vue';
import { inBrowser } from 'vitepress';
import { EMBER_OWNER_KEY } from './constants.js';

export { EMBER_OWNER_KEY };

const STYLE_ID = 'vite-plugin-ember-code-preview';
const CSS = [
  '.ember-playground{padding:12px;border:1px solid var(--vp-c-divider);border-radius:10px}',
  '.ember-playground__error{padding:8px 12px;margin-bottom:8px;border-radius:6px;background:var(--vp-c-danger-soft);color:var(--vp-c-danger-1);font-size:13px;font-family:var(--vp-font-family-mono);white-space:pre-wrap;word-break:break-word}',
  '.ember-playground__source{margin-top:12px;border-top:1px solid var(--vp-c-divider)}',
  '.ember-playground__source summary{padding:8px 0 4px;cursor:pointer;font-size:13px;color:var(--vp-c-text-2);user-select:none}',
  '.ember-playground__source summary:hover{color:var(--vp-c-text-1)}',
  ".ember-playground__source div[class*='language-']{margin:0;border-radius:0 0 8px 8px}",
].join('');

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
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
    const injectedOwner = inject<object | undefined>(EMBER_OWNER_KEY, undefined);
    const mountEl = ref<HTMLDivElement | null>(null);
    const error = ref<string | null>(null);
    let cleanup: undefined | { destroy?: () => void };

    let rendererPromise: Promise<{ renderComponent: Function }> | undefined;
    function getRenderer() {
      rendererPromise ??= import('@ember/renderer') as any;
      return rendererPromise!;
    }

    onMounted(async () => {
      ensureStyle();
      if (!inBrowser || !mountEl.value) return;

      try {
        const [mod, { renderComponent }] = await Promise.all([
          props.loader ? props.loader() : import(/* @vite-ignore */ props.src!),
          getRenderer(),
        ]);

        const component = mod?.default ?? mod;
        const owner = props.owner ?? injectedOwner;
        cleanup = renderComponent(component, {
          into: mountEl.value,
          ...(owner ? { owner } : {}),
        });
      } catch (err) {
        console.error('[CodePreview] Failed to render:', err);
        error.value = String(err);
      }
    });

    onBeforeUnmount(() => {
      cleanup?.destroy?.();
      cleanup = undefined;
    });

    return () => {
      const children = [];

      if (error.value) {
        children.push(h('div', { class: 'ember-playground__error' }, error.value));
      }

      children.push(h('div', { ref: mountEl }));

      if (slots.default) {
        if (props.collapsible) {
          children.push(
            h('details', { class: 'ember-playground__source' }, [
              h('summary', 'Show code'),
              slots.default(),
            ]),
          );
        } else {
          children.push(h('div', { class: 'ember-playground__source' }, slots.default()));
        }
      }

      return h('div', { class: 'ember-playground' }, children);
    };
  },
});
