import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/webKit', () => ({ isLocalAuth: false }));
vi.mock('../src/components/LocalLayout.vue', () => ({ default: {} }));
vi.mock('../src/stores', () => ({
  useWhoamiStore: () =>
    Vue.reactive({
      whoami: Vue.ref({ isSignedIn: true, user: { id: 1 } }),
    }),
}));
vi.mock('@vicons/material', () =>
  Object.fromEntries(
    [
      'BookOutlined',
      'ForumOutlined',
      'HistoryOutlined',
      'HomeOutlined',
      'LanguageOutlined',
      'LocalFireDepartmentOutlined',
      'SettingsOutlined',
      'StarBorderOutlined',
      'WorkspacesOutlined',
    ].map((name) => [name, {}]),
  ),
);
vi.mock('@novelia/web-kit', () => ({
  WebKitLayout: Vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        Vue.h('main', slots.default?.()),
  }),
  XButton: {},
  useWebKitViewport: () => ({ isMobile: Vue.ref(false) }),
}));

interface HostNode {
  parent?: HostNode;
  children: HostNode[];
  getRootNode(): object;
}
const node = (): HostNode => ({
  children: [],
  getRootNode: () => ({ activeElement: null }),
});
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: node,
  createComment: node,
  setText() {},
  setElementText() {},
  patchProp() {},
  insert(child, parent, anchor) {
    if (child.parent) {
      child.parent.children.splice(child.parent.children.indexOf(child), 1);
    }
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(
      index < 0 ? parent.children.length : index,
      0,
      child,
    );
  },
  remove(child) {
    if (child.parent) {
      child.parent.children.splice(child.parent.children.indexOf(child), 1);
    }
    child.parent = undefined;
  },
  parentNode: (child) => child.parent ?? null,
  nextSibling: (child) => {
    const siblings = child.parent?.children ?? [];
    return siblings[siblings.indexOf(child) + 1] ?? null;
  },
});
let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
});

it('keeps the new bookshelf route root alive across a novel visit', async () => {
  const { default: Layout } = await import('../src/pages/MainLayout.vue');
  const source = readFileSync(
    new URL('../src/pages/MainLayout.vue', import.meta.url),
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + '<template>'.length,
    source.lastIndexOf('</template>'),
  );
  const ClientLayout = {
    ...Layout,
    setup(props: unknown, context: unknown) {
      return { ...Layout.setup!(props, context) };
    },
    render: Vue.compile(template),
  };
  const mounted = vi.fn();
  const unmounted = vi.fn();
  const activated = vi.fn();
  const BookshelfView = Vue.defineComponent({
    name: 'BookshelfView',
    setup() {
      Vue.onMounted(mounted);
      Vue.onUnmounted(unmounted);
      Vue.onActivated(activated);
      return () => Vue.h('section');
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: ClientLayout,
        children: [
          { path: 'favorite/web/default', component: BookshelfView },
          {
            path: 'novel/example',
            component: { render: () => Vue.h('article') },
          },
        ],
      },
    ],
  });
  await router.push('/favorite/web/default');
  const app = renderer.createApp({ render: () => Vue.h(RouterView) });
  app.component('StarBorderOutlined', { render: () => null });
  app.component('XButton', { render: () => null });
  app.use(router);
  app.provide(Vue.ssrContextKey, { modules: new Set() });
  app.mount(node());
  unmount = () => app.unmount();
  await Vue.nextTick();
  expect(mounted).toHaveBeenCalledOnce();
  await router.push('/novel/example');
  await Vue.nextTick();
  expect(unmounted).not.toHaveBeenCalled();
  await router.push('/favorite/web/default');
  await Vue.nextTick();
  expect(mounted).toHaveBeenCalledOnce();
  expect(activated).toHaveBeenCalledTimes(2);
});
