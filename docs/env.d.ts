/// <reference types="vite/client" />
/// <reference types="@glint/ember-tsc/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}

declare module 'vite-plugin-ember/components/EmberPlayground.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}
