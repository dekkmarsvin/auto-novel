import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ChapterMeta,
  TaskState,
} from '../src/domain/translator/TaskState';

const boundary = vi.hoisted(() => ({
  store: vi.fn(),
  task: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('../src/stores', () => ({ useWorkspaceStore: boundary.store }));
vi.mock(
  '../src/domain/translator/TranslationTask/createTranslationTask',
  () => ({
    createTranslationTask: boundary.task,
  }),
);
vi.mock('../src/domain/translator/TaskExecutor', () => ({
  TaskExecutor: class {
    constructor(private task: { id: string }) {}
    executeChapter(...args: unknown[]) {
      return boundary.execute(this.task.id, ...args);
    }
  },
}));
vi.mock('../src/domain/translator/IndexedDbSegmentCache', () => ({
  IndexedDbSegmentCache: class {},
}));
vi.mock('@auto-novel/translator', () => ({
  Semaphore: class {},
  OpenAiTranslator: class {},
  SakuraTranslator: class {},
  TranslationPipeline: class {
    queue = { clear() {} };
    registerTranslator() {}
    unregisterTranslator() {}
    clearLoops() {}
  },
}));
vi.mock('vue-draggable-plus', () => ({ VueDraggable: {} }));
vi.mock('@vicons/material', () => ({
  BookOutlined: {},
  DeleteOutlineOutlined: {},
  PlusOutlined: {},
  RefreshOutlined: {},
}));
vi.mock('naive-ui', () => ({
  useMessage: () => ({ error: vi.fn(), info: vi.fn() }),
}));
vi.mock('../src/pages/util', () => ({ doAction: vi.fn() }));
vi.mock('../src/pages/workspace/components/PipelineTaskCard.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/components/PipelineWorkerCard.vue', () => ({
  default: {},
}));
vi.mock(
  '../src/pages/workspace/components/LocalVolumeListSpecificTranslation.vue',
  () => ({ default: {} }),
);
vi.mock('../src/pages/workspace/components/SakuraWorkerModal.vue', () => ({
  default: {},
}));
vi.mock('../src/pages/workspace/components/GptPipelineWorkerModal.vue', () => ({
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
const flush = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Vue.nextTick();
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
interface Controls {
  startAllWorkers(): void;
  stopAllWorkers(): void;
  runProcessLoop(): void;
  taskStates: Vue.Ref<Map<string, TaskState>>;
}
interface Execution {
  id: string;
  chapter: string;
  signal: AbortSignal;
  finished: boolean;
  finish(status?: 'done' | 'error' | 'pending'): void;
}
const cleanups: (() => void)[] = [];
afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  await flush();
  vi.clearAllMocks();
});

async function workspace() {
  const jobs = Vue.ref<
    { task: string; description: string; createAt: number }[]
  >([]);
  const records = Vue.ref({
    workers: [{ id: 'offline', concurrency: 1 }],
    jobs: [],
  });
  boundary.store.mockImplementation((type: string) =>
    type === 'gpt-pipeline'
      ? { ref: records }
      : { ref: Vue.computed(() => ({ jobs: jobs.value })) },
  );
  const tasks = new Map<
    string,
    {
      id: string;
      initialized: boolean;
      chapters: ChapterMeta[];
      initMeta(): Promise<void>;
    }
  >();
  boundary.task.mockImplementation(({ volumeId }: { volumeId: string }) =>
    tasks.get(volumeId),
  );
  const calls: Execution[] = [];
  boundary.execute.mockImplementation(
    (
      id: string,
      chapter: string,
      tracker: {
        onChapterStatus(id: string, status: string): void;
      },
      signal: AbortSignal,
    ) =>
      new Promise<void>((resolve) => {
        const call: Execution = {
          id,
          chapter,
          signal,
          finished: false,
          finish(status = 'done') {
            if (call.finished) return;
            call.finished = true;
            tracker.onChapterStatus(chapter, status);
            resolve();
          },
        };
        calls.push(call);
      }),
  );
  const { default: Workspace } = await import(
    '../src/pages/workspace/GptPipelineWorkspace.vue'
  );
  let controls!: Controls;
  const app = renderer.createApp({
    setup() {
      // Run the production SFC setup, including its watchers and lifecycle hooks.
      // Rendering controls adds no coverage to this scheduling contract.
      controls = Workspace.setup!(
        { translatorId: 'gpt' },
        { expose() {} },
      ) as Controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  let mounted = true;
  const unmount = () => {
    if (mounted) {
      mounted = false;
      app.unmount();
    }
  };
  cleanups.push(() => {
    unmount();
    calls.forEach((call) => call.finish('pending'));
  });
  const add = (id: string, count = 1, meta = Promise.resolve()) => {
    const task = {
      id,
      initialized: false,
      chapters: Array.from({ length: count }, (_, order) => ({
        chapterId: String(order),
        title: String(order),
        order,
        status: 'pending' as const,
      })),
      async initMeta() {
        await meta;
        task.initialized = true;
      },
    };
    tasks.set(id, task);
    jobs.value.push({
      task: `local/${id}`,
      description: id,
      createAt: tasks.size,
    });
  };
  return {
    add,
    calls,
    controls,
    unmount,
    active: () => calls.filter((call) => !call.finished),
  };
}

describe('pipeline workspace scheduling', () => {
  it('fills free chapter slots when a newly added task finishes delayed initialization', async () => {
    const ws = await workspace();
    ws.add('first');
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.calls.map((call) => call.id)).toEqual(['first']);
    const meta = deferred();
    ws.add('late', 1, meta.promise);
    await flush();
    expect(ws.calls).toHaveLength(1);
    meta.resolve();
    await flush();
    expect(ws.active().map((call) => call.id)).toEqual(['first', 'late']);
  });

  it('keeps the 66-chapter limit when retrying failures and appending more work', async () => {
    const ws = await workspace();
    ws.add('original', 66);
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.active()).toHaveLength(66);
    ws.calls[0].finish('error');
    await flush();
    const state = ws.controls.taskStates.value.get('local/original')!;
    state.updateStatus('0', 'pending');
    ws.controls.runProcessLoop();
    await flush();
    expect(ws.active()).toHaveLength(66);
    ws.add('appended', 40);
    await flush();
    expect(ws.active()).toHaveLength(66);
    expect(ws.calls.filter((call) => call.id === 'appended')).toHaveLength(0);
    ws.active()
      .slice(0, 6)
      .forEach((call) => call.finish());
    await flush();
    expect(ws.active()).toHaveLength(66);
    expect(ws.calls.filter((call) => call.id === 'appended')).toHaveLength(6);
    expect(
      new Set(ws.active().map((call) => `${call.id}/${call.chapter}`)).size,
    ).toBe(66);
  });

  it('counts retiring processors across restart and stops taking work after unmount', async () => {
    const ws = await workspace();
    ws.add('restart', 67);
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    const old = [...ws.active()];
    ws.controls.stopAllWorkers();
    expect(old.every((call) => call.signal.aborted)).toBe(true);
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.calls).toHaveLength(66);
    old[0].finish('pending');
    await flush();
    expect(ws.active()).toHaveLength(66);
    expect(ws.calls).toHaveLength(67);
    expect(ws.calls[66].signal.aborted).toBe(false);
    ws.unmount();
    expect(ws.active().every((call) => call.signal.aborted)).toBe(true);
    ws.active().forEach((call) => call.finish('pending'));
    await flush();
    expect(ws.calls).toHaveLength(67);
  });
});
