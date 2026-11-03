import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkerCard from '../src/pages/workspace/worker/WorkerCard.vue';

const boundary = vi.hoisted(() => ({
  translate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@auto-novel/translator', async (original) => ({
  ...(await original<object>()),
  createTranslator: async () => ({
    trusted: true,
    translate: boundary.translate,
  }),
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: { success: boundary.success, error: boundary.error },
}));
vi.mock('../src/pages/workspace/worker/GptWorkerDialog.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/worker/SakuraWorkerDialog.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/WorkspaceActionButton.vue', () => ({
  default: {},
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
const cleanup: (() => void)[] = [];
beforeEach(() => {
  boundary.translate.mockReset();
  boundary.success.mockClear();
  boundary.error.mockClear();
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

function mount() {
  let controls!: { testWorker(): Promise<void> };
  const app = renderer.createApp({
    setup() {
      controls = WorkerCard.setup!(
        {
          translatorId: 'gpt',
          worker: {
            id: 'fixture',
            endpoint: 'https://fixture.invalid/v1',
            model: 'fixture',
            key: 'synthetic-key',
            concurrency: 1,
          },
          running: false,
          currentConcurrency: 0,
          errorCount: 0,
        },
        { expose() {}, emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanup.push(() => app.unmount());
  return controls;
}

it('reports an actual pipeline failure as an error instead of successful source fallback', async () => {
  boundary.translate.mockRejectedValue(new Error('401 fixture unauthorized'));
  await mount().testWorker();
  expect(boundary.translate).toHaveBeenCalled();
  expect(boundary.success).not.toHaveBeenCalled();
  expect(boundary.error).toHaveBeenCalledWith(
    expect.stringContaining('401 fixture unauthorized'),
  );
});

it('reports success when the actual pipeline returns a complete translation', async () => {
  boundary.translate.mockResolvedValue(['穿過國境長長的隧道，便是雪國。']);
  await mount().testWorker();
  expect(boundary.error).not.toHaveBeenCalled();
  expect(boundary.success).toHaveBeenCalledWith(
    expect.stringContaining('穿過國境長長的隧道，便是雪國。'),
  );
});
