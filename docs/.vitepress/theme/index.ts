import DefaultTheme from 'vitepress/theme';
import EmberPlayground from 'vite-plugin-ember/components/EmberPlayground.vue';
import type { Theme } from 'vitepress';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component('EmberPlayground', EmberPlayground);
  },
} satisfies Theme;
