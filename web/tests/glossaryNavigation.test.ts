import {
  createRenderer,
  defineComponent,
  h,
  nextTick,
  onUnmounted,
  ref,
} from 'vue';
import {
  createMemoryHistory,
  createRouter,
  isNavigationFailure,
  NavigationFailureType,
  RouterView,
} from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGlossaryNavigationGuard } from '../src/components/glossaryNavigation';

interface HostNode {
  children: HostNode[];
  parent?: HostNode;
  text?: string;
}
const node = (): HostNode => ({ children: [] });
const renderer = createRenderer<HostNode, HostNode>({
  createElement: node,
  createText: (text) => ({ children: [], text }),
  createComment: node,
  setText: (value, text) => {
    value.text = text;
  },
  setElementText: (value, text) => {
    value.text = text;
  },
  patchProp: () => {},
  parentNode: (value) => value.parent ?? null,
  nextSibling: (value) => {
    const siblings = value.parent?.children ?? [];
    return siblings[siblings.indexOf(value) + 1] ?? null;
  },
  insert(value, parent, anchor) {
    if (value.parent) {
      const siblings = value.parent.children;
      siblings.splice(siblings.indexOf(value), 1);
    }
    value.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(
      index < 0 ? parent.children.length : index,
      0,
      value,
    );
  },
  remove(value) {
    const siblings = value.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(value), 1);
    value.parent = undefined;
  },
});

const apps: ReturnType<typeof renderer.createApp>[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
});

async function editorRouter(initial: string) {
  const dirty = ref(true);
  const unmounted = vi.fn();
  let answer!: (allow: boolean) => void;
  const confirmLeave = vi.fn(() =>
    dirty.value
      ? new Promise<boolean>((resolve) => {
          answer = resolve;
        })
      : true,
  );
  const Editor = defineComponent({
    setup() {
      useGlossaryNavigationGuard(confirmLeave);
      onUnmounted(unmounted);
      return () => h('div');
    },
  });
  const NovelPage = defineComponent({ setup: () => () => h(Editor) });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      // These keys match production's WebNovel/WenkuNovel route props.
      {
        path: '/novel/:providerId/:novelId',
        component: NovelPage,
        props: (route) => ({ key: route.path }),
      },
      {
        path: '/wenku/:novelId',
        component: NovelPage,
        props: (route) => ({ key: route.path }),
      },
      { path: '/workspace', component: { render: () => h('div') } },
    ],
  });
  await router.push(initial);
  const app = renderer.createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(node());
  apps.push(app);
  await nextTick();
  return {
    router,
    dirty,
    confirmLeave,
    unmounted,
    answer(allow: boolean) {
      if (allow) dirty.value = false;
      answer(allow);
    },
  };
}

describe('glossary editor navigation through real router records', () => {
  for (const [kind, first, second] of [
    ['web', '/novel/syosetu/a', '/novel/syosetu/b'],
    ['wenku', '/wenku/a', '/wenku/b'],
  ] as const) {
    it(`${kind}: cancelling a same-record novel change keeps the dirty editor mounted`, async () => {
      const state = await editorRouter(first);
      const navigation = state.router.push(second);
      await vi.waitFor(() =>
        expect(state.confirmLeave).toHaveBeenCalledTimes(1),
      );
      expect(state.router.currentRoute.value.path).toBe(first);
      expect(state.unmounted).not.toHaveBeenCalled();
      state.answer(false);
      expect(
        isNavigationFailure(await navigation, NavigationFailureType.aborted),
      ).toBe(true);
      expect(state.router.currentRoute.value.path).toBe(first);
      expect(state.dirty.value).toBe(true);
      expect(state.unmounted).not.toHaveBeenCalled();
    });

    it(`${kind}: confirming a same-record novel change allows the keyed editor to remount`, async () => {
      const state = await editorRouter(first);
      const navigation = state.router.push(second);
      await vi.waitFor(() =>
        expect(state.confirmLeave).toHaveBeenCalledTimes(1),
      );
      state.answer(true);
      await navigation;
      await nextTick();
      expect(state.router.currentRoute.value.path).toBe(second);
      expect(state.unmounted).toHaveBeenCalledTimes(1);
    });

    it(`${kind}: query and hash changes retain the draft without prompting`, async () => {
      const state = await editorRouter(first);
      await state.router.push(`${first}?tab=glossary#terms`);
      expect(state.confirmLeave).not.toHaveBeenCalled();
      expect(state.unmounted).not.toHaveBeenCalled();
      expect(state.dirty.value).toBe(true);
    });

    it(`${kind}: cancelling history navigation to another novel restores the current route`, async () => {
      const state = await editorRouter(first);
      state.dirty.value = false;
      await state.router.push(second);
      await nextTick();
      state.confirmLeave.mockClear();
      state.unmounted.mockClear();
      state.dirty.value = true;
      const completed = new Promise<unknown>((resolve) => {
        const stop = state.router.afterEach((_to, _from, failure) => {
          stop();
          resolve(failure);
        });
      });
      state.router.back();
      await vi.waitFor(() =>
        expect(state.confirmLeave).toHaveBeenCalledTimes(1),
      );
      state.answer(false);
      expect(
        isNavigationFailure(await completed, NavigationFailureType.aborted),
      ).toBe(true);
      await nextTick();
      expect(state.router.currentRoute.value.path).toBe(second);
      expect(state.dirty.value).toBe(true);
      expect(state.unmounted).not.toHaveBeenCalled();
    });
  }

  it('changing only the web provider also requires confirmation', async () => {
    const state = await editorRouter('/novel/syosetu/a');
    const navigation = state.router.push('/novel/kakuyomu/a');
    await vi.waitFor(() => expect(state.confirmLeave).toHaveBeenCalledTimes(1));
    state.answer(false);
    expect(isNavigationFailure(await navigation)).toBe(true);
    expect(state.router.currentRoute.value.path).toBe('/novel/syosetu/a');
  });

  it('leaving the novel record still requires confirmation', async () => {
    const state = await editorRouter('/wenku/a');
    const navigation = state.router.push('/workspace');
    await vi.waitFor(() => expect(state.confirmLeave).toHaveBeenCalledTimes(1));
    state.answer(false);
    expect(isNavigationFailure(await navigation)).toBe(true);
    expect(state.router.currentRoute.value.path).toBe('/wenku/a');
  });
});
