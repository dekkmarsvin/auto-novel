import * as Vue from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReadHistoryView from '../src/pages/history/ReadHistoryView.vue';

const boundary = vi.hoisted(() => ({
  loadState: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  clear: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../src/repos', () => ({
  WebNovelRepo: {
    useWebNovelHistoryList: () => ({
      data: Vue.ref({
        pageNumber: 3,
        items: [{ providerId: 'syosetu', novelId: 'n1' }],
      }),
      error: Vue.ref(undefined),
    }),
    clearReadHistory: boundary.clear,
    deleteReadHistory: boundary.remove,
  },
}));
vi.mock('../src/stores', () => ({
  useReadHistoryStore: () => ({
    readHistoryPaused: Vue.ref(false),
    loadReadHistoryPausedState: boundary.loadState,
    pauseReadHistory: boundary.pause,
    resumeReadHistory: boundary.resume,
  }),
}));
vi.mock('../src/router', () => ({ default: { push: boundary.push } }));
vi.mock('@novelia/web-kit', () => ({
  Toast: { promise: (promise: Promise<unknown>) => promise, error: vi.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

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
const cleanups: (() => void)[] = [];
beforeEach(() => {
  Object.values(boundary).forEach((mock) =>
    mock.mockReset().mockResolvedValue(undefined),
  );
});
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/read-history', component: { render: () => null } }],
  });
  await router.push('/read-history?page=3&keep=value');
  let controls!: {
    recordStateLabel: Vue.ComputedRef<string>;
    showClearConfirmation: Vue.Ref<boolean>;
    clearingHistory: Vue.Ref<boolean>;
    toggleRecording(): Promise<void>;
    clearHistory(): Promise<void>;
    deleteHistory(providerId: string, novelId: string): Promise<void>;
    isDeletingHistory(providerId: string, novelId: string): boolean;
  };
  const app = renderer.createApp({
    setup() {
      controls = ReadHistoryView.setup!(
        { page: 3 },
        { expose() {}, emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.use(router).provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  await Vue.nextTick();
  return controls;
}

it('retries a failed recording-state load before allowing pause/resume', async () => {
  boundary.loadState.mockRejectedValueOnce(new Error('offline'));
  const controls = await mount();
  await vi.waitFor(() => expect(controls.recordStateLabel.value).toBe('重试'));
  await controls.toggleRecording();
  expect(boundary.loadState).toHaveBeenCalledTimes(2);
  expect(boundary.pause).not.toHaveBeenCalled();
  expect(controls.recordStateLabel.value).toBe('暂停记录');
  await controls.toggleRecording();
  expect(boundary.pause).toHaveBeenCalledOnce();
  expect(boundary.resume).not.toHaveBeenCalled();
});

it('keeps the clear dialog open after failure, prevents double submission and resets pagination only on success', async () => {
  const controls = await mount();
  controls.showClearConfirmation.value = true;
  let reject!: (reason: Error) => void;
  boundary.clear.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const running = controls.clearHistory();
  await controls.clearHistory();
  expect(boundary.clear).toHaveBeenCalledOnce();
  expect(controls.clearingHistory.value).toBe(true);
  reject(new Error('offline'));
  await running;
  expect(controls.showClearConfirmation.value).toBe(true);
  expect(controls.clearingHistory.value).toBe(false);
  expect(boundary.push).not.toHaveBeenCalled();
  await controls.clearHistory();
  expect(controls.showClearConfirmation.value).toBe(false);
  expect(boundary.push).toHaveBeenCalledWith({
    path: '/read-history',
    query: { page: 1, keep: 'value' },
  });
});

it('releases failed row deletion for retry and leaves the last page only after success', async () => {
  const controls = await mount();
  boundary.remove.mockRejectedValueOnce(new Error('offline'));
  await controls.deleteHistory('syosetu', 'n1');
  expect(controls.isDeletingHistory('syosetu', 'n1')).toBe(false);
  expect(boundary.push).not.toHaveBeenCalled();
  await controls.deleteHistory('syosetu', 'n1');
  expect(boundary.remove).toHaveBeenCalledTimes(2);
  expect(boundary.push).toHaveBeenCalledWith({
    path: '/read-history',
    query: { page: 2, keep: 'value' },
  });
});
