<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { inBrowser } from 'vitepress';

const props = defineProps<{
  src?: string;
  loader?: () => Promise<any>;
}>();
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
    cleanup = renderComponent(component, { into: mountEl.value });
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
