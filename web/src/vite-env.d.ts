/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;
declare const __COMMIT_SHA__: string;
declare const __GIT_REPOSITORY__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
