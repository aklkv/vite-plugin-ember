import DefaultTheme from 'vitepress/theme';
import CodePreview from 'vite-plugin-ember/components/code-preview.vue';
import type { Theme } from 'vitepress';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('CodePreview', CodePreview);
  },
} satisfies Theme;
