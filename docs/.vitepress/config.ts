import { defineConfig } from 'vitepress';
import vitePluginEmber, { emberFence } from 'vite-plugin-ember';

export default defineConfig({
  title: 'Ember in VitePress',
  description: 'Render live Ember components inside VitePress documentation',
  base: process.env.BASE_URL ?? '/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/guide/plugin-api' },
      { text: 'Examples', link: '/examples' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Writing Components', link: '/guide/writing-components' },
          { text: 'How It Works', link: '/guide/how-it-works' },
          { text: 'Plugin API', link: '/guide/plugin-api' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/aklkv/vite-plugin-ember' },
    ],
  },
  vite: {
    plugins: [vitePluginEmber()],
  },
  markdown: {
    config(md) {
      emberFence(md);
    },
  },
});
