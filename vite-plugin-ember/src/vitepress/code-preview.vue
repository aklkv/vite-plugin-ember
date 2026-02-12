<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, inject } from 'vue';
import { inBrowser } from 'vitepress';

/**
 * Vue injection key for providing a default Ember owner to all CodePreview
 * instances. Provide this in your VitePress theme's `enhanceApp` to enable
 * `@service` injection in live demos.
 *
 * @example
 * ```ts
 * import { EMBER_OWNER_KEY } from 'vite-plugin-ember/components/code-preview.vue';
 *
 * export default {
 *   ...DefaultTheme,
 *   enhanceApp({ app }) {
 *     const owner = buildMyOwner(); // create & configure an Ember owner
 *     app.provide(EMBER_OWNER_KEY, owner);
 *   },
 * } satisfies Theme;
 * ```
 */
export const EMBER_OWNER_KEY = Symbol('ember-owner');

const props = defineProps<{
  src?: string;
  loader?: () => Promise<any>;
  owner?: object;
}>();
const injectedOwner = inject<object | undefined>(EMBER_OWNER_KEY, undefined);
const mountEl = ref<HTMLDivElement | null>(null);
const error = ref<string | null>(null);
let cleanup: undefined | { destroy?: () => void };

// Cache the renderer import — shared across all CodePreview instances
let rendererPromise: Promise<{ renderComponent: Function }> | undefined;

function getRenderer() {
  rendererPromise ??= import('@ember/renderer') as any;
  return rendererPromise!;
}

onMounted(async () => {
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
</script>

<template>
  <div class="ember-playground">
    <div v-if="error" class="ember-playground__error">{{ error }}</div>
    <div ref="mountEl"></div>
    <slot />
  </div>
</template>

<style scoped>
.ember-playground {
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}

.ember-playground__error {
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  font-size: 13px;
  font-family: var(--vp-font-family-mono);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
