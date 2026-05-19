import DefaultTheme from 'vitepress/theme';
import { setupEmber } from 'vite-plugin-ember/setup';
import GreetingService from '../../demos/greeting-service';
import type { Theme } from 'vitepress';
import './custom.css';

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    setupEmber(app, {
      services: {
        greeting: new GreetingService(),
      },
    });
  },
} satisfies Theme;
