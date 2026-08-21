/// <reference types="vite/client" />

declare const __BUILD_INFO__: Readonly<{
  gitCommit: string;
  gitRepository: string;
  buildTime: string;
}>;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
