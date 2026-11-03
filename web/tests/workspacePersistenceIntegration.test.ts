import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { useGptPipelinePersistence } from '../src/stores/gptPipelinePersistence';
import {
  migrateGptWorkers,
  gptWorkerMigrationKey,
} from '../src/stores/migrateGptWorkers';
import type { WorkspaceLocks } from '../src/stores/workspaceLock';
import WorkerSection from '../src/pages/workspace/worker/WorkerSection.vue';

const boundary = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/stores', () => ({ useWorkspaceStore: () => boundary.store }));
vi.mock('@novelia/web-kit', () => ({
  Toast: {},
  XConfirmDialog: {},
  XDropdownMenu: {},
  XDropdownMenuItem: {},
  XEmpty: {},
}));
vi.mock('vue-draggable-plus', () => ({ VueDraggable: {} }));
vi.mock('../src/pages/workspace/worker/WorkerCard.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/worker/GptWorkerDialog.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/worker/SakuraWorkerDialog.vue', () => ({
  default: {},
}));

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}
type Worker = {
  id: string;
  model: string;
  key: string;
  endpoint: string;
  concurrency: number;
};
const worker = (id: string): Worker => ({
  id,
  model: 'fixture-model',
  key: `synthetic-${id}`,
  endpoint: 'https://model.test',
  concurrency: 1,
});
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
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

it('keeps production imports when a stale drag updates the new worker section', async () => {
  const storage = new MemoryStorage();
  const browser = Object.assign(new EventTarget(), { localStorage: storage });
  vi.stubGlobal('window', browser);
  let pending = Promise.resolve();
  const locks: WorkspaceLocks = {
    request<T>(_name: string, action: () => T | Promise<T>) {
      const result = pending.then(action);
      pending = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const key = 'workspace-gpt-pipeline';
  storage.setItem(
    key,
    JSON.stringify({
      workers: [worker('one'), worker('two')],
      jobs: [],
      uncompletedJobs: [],
    }),
  );
  let controls!: { workers: Vue.WritableComputedRef<Worker[]> };
  let persistence!: ReturnType<
    typeof useGptPipelinePersistence<{
      workers: Worker[];
      jobs: [];
      uncompletedJobs: [];
    }>
  >;
  const app = renderer.createApp({
    setup() {
      persistence = useGptPipelinePersistence(
        { workers: [] as Worker[], jobs: [], uncompletedJobs: [] },
        { storage, locks },
      );
      boundary.store = { ref: persistence.ref };
      controls = WorkerSection.setup!(
        {
          translatorId: 'gpt',
          workerStates: new Map(),
          workerErrors: new Map(),
          clearTranslationCache: async () => {},
        },
        { expose() {}, emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  await persistence.initialized;

  // The same computed setter is the production VueDraggable v-model boundary.
  controls.workers.value = [...controls.workers.value].reverse();
  expect(await persistence.persisted()).toBe(true);
  expect(
    JSON.parse(storage.getItem(key)!).workers.map((w: Worker) => w.id),
  ).toEqual(['two', 'one']);
  const stale = JSON.parse(JSON.stringify(controls.workers.value)) as Worker[];
  const legacy = JSON.stringify({
    workers: [worker('legacy')],
    jobs: [{ task: 'retained-job' }],
    uncompletedJobs: [],
  });
  storage.setItem('workspace-gpt', legacy);
  expect(await migrateGptWorkers(storage, locks)).toBe(true);

  // No storage event has reached this old view; its attempted reorder must
  // conflict rather than writing its old whole-workspace snapshot over import.
  controls.workers.value = stale.reverse();
  expect(await persistence.persisted()).toBe(false);
  expect(persistence.error.value).toBeTruthy();
  expect(controls.workers.value.map((w) => w.id)).toEqual([
    'two',
    'one',
    'legacy',
  ]);
  expect(
    JSON.parse(storage.getItem(key)!).workers.map((w: Worker) => w.id),
  ).toEqual(['two', 'one', 'legacy']);
  expect(storage.getItem('workspace-gpt')).toBe(legacy);
  expect(storage.getItem(gptWorkerMigrationKey)).toBe('1');
});
