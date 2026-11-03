import * as Vue from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WenkuNovelEdit from '../src/pages/novel/WenkuNovelEdit.vue';

const boundary = vi.hoisted(() => ({ list: vi.fn(), warning: vi.fn() }));
vi.mock('../src/api', () => ({ WenkuNovelApi: { listNovel: boundary.list } }));
vi.mock('../src/repos', () => ({ WenkuNovelRepo: {} }));
vi.mock('../src/domain/smart-import', () => ({
  prettyCover: vi.fn(),
  smartImport: vi.fn(),
}));
vi.mock('../src/pages/util', () => ({ useIsWideScreen: () => Vue.ref(true) }));
vi.mock('../src/stores', () => ({
  useWhoamiStore: () => ({ whoami: Vue.ref({ hasNsfwAccess: false }) }),
}));
vi.mock('../src/util', () => ({
  RegexUtil: { isUrl: () => true, hasKanaChars: () => false },
}));
vi.mock('@novelia/web-kit', () => ({ Toast: { warning: boundary.warning } }));
vi.mock('naive-ui', () => ({}));
vi.mock('vue-draggable-plus', () => ({ VueDraggable: {} }));

const renderer = Vue.createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  patchProp() {},
  insert() {},
  remove() {},
  parentNode: () => null,
  nextSibling: () => null,
});
const cleanup: (() => void)[] = [];
beforeEach(() => {
  boundary.list.mockReset();
  boundary.warning.mockClear();
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/wenku-edit');
  let controls!: {
    formValue: Vue.Ref<{ title: string }>;
    similarNovels: Vue.Ref<unknown[] | null>;
    similarSearchFailed: Vue.Ref<boolean>;
    canConfirmSimilar: Vue.Ref<boolean>;
    searching: Vue.Ref<boolean>;
    findSimilarNovels(): Promise<void>;
  };
  const app = renderer.createApp({
    setup() {
      controls = WenkuNovelEdit.setup!(
        { novelId: undefined },
        { expose() {}, emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.use(router).provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanup.push(() => app.unmount());
  controls.formValue.value.title = '最初の題名';
  await Vue.nextTick();
  return controls;
}

it('keeps manual confirmation available after the actual editor search fails', async () => {
  boundary.list.mockRejectedValue(new Error('offline'));
  const controls = await mount();
  expect(controls.canConfirmSimilar.value).toBe(false);
  await controls.findSimilarNovels();
  expect(controls.similarSearchFailed.value).toBe(true);
  expect(controls.canConfirmSimilar.value).toBe(true);
  expect(controls.searching.value).toBe(false);
  controls.formValue.value.title = '別の題名';
  await Vue.nextTick();
  expect(controls.canConfirmSimilar.value).toBe(false);
});

it('does not let the actual editor accept an earlier title response', async () => {
  let resolve!: (value: { items: unknown[] }) => void;
  const pending = new Promise<{ items: unknown[] }>((done) => {
    resolve = done;
  });
  boundary.list.mockReturnValue(pending);
  const controls = await mount();
  const running = controls.findSimilarNovels();
  expect(controls.searching.value).toBe(true);
  controls.formValue.value.title = '別の題名';
  await Vue.nextTick();
  resolve({ items: [{ id: 'earlier-title' }] });
  await running;
  expect(controls.similarNovels.value).toBeNull();
  expect(controls.canConfirmSimilar.value).toBe(false);
  expect(controls.searching.value).toBe(false);
});

it('enables confirmation after a successful actual editor search', async () => {
  boundary.list.mockResolvedValue({ items: [] });
  const controls = await mount();
  await controls.findSimilarNovels();
  expect(boundary.list.mock.calls.map(([request]) => request.level)).toEqual([
    0, 4,
  ]);
  expect(controls.similarNovels.value).toEqual([]);
  expect(controls.canConfirmSimilar.value).toBe(true);
  expect(controls.searching.value).toBe(false);
});
