declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
  export const EMBER_OWNER_KEY: symbol;
}
