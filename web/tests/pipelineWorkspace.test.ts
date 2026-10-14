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
  createSakura: vi.fn(),
  translate: vi.fn(),
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
  SakuraTranslator: class {
    constructor(private allowed: boolean) {}
    static async create() {
      return new this(await boundary.createSakura());
    }
    allowUpload() {
      return this.allowed;
    }
  },
  TranslationPipeline: class {
    queue = { clear() {} };
    registerTranslator() {}
    unregisterTranslator() {}
    clearLoops() {}
    translate(...args: unknown[]) {
      return boundary.translate(...args);
    }
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
  deleteJob(task: string): void;
  taskStates: Vue.Ref<Map<string, TaskState>>;
}
interface Execution {
  id: string;
  chapter: string;
  signal: AbortSignal;
  finished: boolean;
  finish(status?: 'done' | 'error' | 'pending'): void;
  progress(finished: number, error: number, total: number): void;
}
interface MetadataCall {
  id: string;
  signal: AbortSignal;
  canUpload(): boolean;
  translate(texts: string[]): Promise<string[]>;
  resolve(): void;
  reject(error: Error): void;
}
const cleanups: (() => void)[] = [];
afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  await flush();
  vi.clearAllMocks();
});

async function workspace(translatorId: 'gpt' | 'sakura' = 'gpt') {
  const jobs = Vue.ref<
    { task: string; description: string; createAt: number; finishAt?: number }[]
  >([]);
  const records = Vue.ref({
    workers: [{ id: 'offline', concurrency: 1 }],
    jobs: [],
  });
  let storeCalls = 0;
  boundary.store.mockImplementation(() =>
    storeCalls++ === 0
      ? { ref: records }
      : {
          ref: Vue.computed(() => ({ jobs: jobs.value })),
          deleteJob(task: string) {
            jobs.value = jobs.value.filter((job) => job.task !== task);
          },
        },
  );
  boundary.createSakura.mockResolvedValue(true);
  boundary.translate.mockResolvedValue('标题译文\n简介译文\n第二行\n目录译文');
  const metadataCalls: MetadataCall[] = [];
  const tasks = new Map<
    string,
    {
      id: string;
      initialized: boolean;
      chapters: ChapterMeta[];
      initMeta(): Promise<void>;
      needsMetadata?: boolean;
      glossary: Record<string, string>;
      translateMetadata?(
        translate: MetadataCall['translate'],
        signal: AbortSignal,
        canUpload: MetadataCall['canUpload'],
      ): Promise<void>;
    }
  >();
  boundary.task.mockImplementation(
    ({ volumeId, novelId }: { volumeId?: string; novelId?: string }) =>
      tasks.get(volumeId ?? novelId!),
  );
  const calls: Execution[] = [];
  boundary.execute.mockImplementation(
    (
      id: string,
      chapter: string,
      tracker: {
        onChapterStatus(id: string, status: string): void;
        onProgress(finished: number, error: number, total: number): void;
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
          progress(finished, error, total) {
            tracker.onProgress(finished, error, total);
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
        { translatorId },
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
    metadataCalls.forEach((call) => call.resolve());
  });
  let version = 0;
  const add = (
    id: string,
    count = 1,
    meta = Promise.resolve(),
    needsMetadata = false,
  ) => {
    const task = {
      id,
      initialized: false,
      glossary: { 人名: '译名' },
      needsMetadata,
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
      translateMetadata: needsMetadata
        ? (
            translate: MetadataCall['translate'],
            signal: AbortSignal,
            canUpload: MetadataCall['canUpload'],
          ) =>
            new Promise<void>((resolve, reject) => {
              metadataCalls.push({
                id,
                translate,
                signal,
                canUpload,
                resolve,
                reject,
              });
            })
        : undefined,
    };
    tasks.set(id, task);
    jobs.value.push({
      task: needsMetadata ? `web/offline/${id}` : `local/${id}`,
      description: id,
      createAt: ++version,
    });
  };
  return {
    add,
    calls,
    jobs,
    workers: records.value.workers,
    metadataCalls,
    controls,
    unmount,
    active: () => calls.filter((call) => !call.finished),
  };
}

describe('pipeline workspace scheduling', () => {
  it('runs metadata without pending chapters after model detection, and rejects an unapproved model', async () => {
    const ws = await workspace('sakura');
    ws.add('translated', 0, Promise.resolve(), true);
    await flush();
    expect(ws.jobs.value[0].finishAt).toBeUndefined();
    const detection = deferred();
    boundary.createSakura.mockImplementation(async () => {
      await detection.promise;
      return true;
    });
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.metadataCalls).toHaveLength(0);
    detection.resolve();
    await flush();
    expect(ws.metadataCalls).toHaveLength(1);
    expect(ws.calls).toHaveLength(0);
    const metadata = ws.metadataCalls[0];
    expect(metadata.canUpload()).toBe(true);
    const otherDetection = deferred();
    boundary.createSakura.mockImplementationOnce(async () => {
      await otherDetection.promise;
      return true;
    });
    ws.workers.push({ id: 'detecting', concurrency: 1 });
    ws.controls.startAllWorkers();
    await flush();
    // The pending candidate is not registered; the approved worker can continue.
    expect(metadata.canUpload()).toBe(true);
    otherDetection.resolve();
    await flush();
    await expect(
      metadata.translate(['题名', '简介\n第二行', '目录']),
    ).resolves.toEqual(['标题译文', '简介译文\n第二行', '目录译文']);
    expect(boundary.translate).toHaveBeenCalledWith(
      '题名\n简介\n第二行\n目录',
      { 人名: '译名' },
      undefined,
      metadata.signal,
      expect.objectContaining({ onSegError: expect.any(Function) }),
    );
    boundary.translate.mockImplementationOnce(
      async (text, _glossary, _history, _signal, tracker) => {
        tracker.onSegError(0, new Error('Model failed'));
        return text;
      },
    );
    await expect(metadata.translate(['原文'])).rejects.toThrow('分段翻译失败');
    metadata.resolve();
    await flush();
    expect(ws.jobs.value[0].finishAt).toEqual(expect.any(Number));
    ws.controls.runProcessLoop();
    expect(ws.metadataCalls).toHaveLength(1);

    ws.controls.stopAllWorkers();
    ws.add('blocked', 0, Promise.resolve(), true);
    await flush();
    boundary.createSakura.mockResolvedValue(false);
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.metadataCalls).toHaveLength(1);
    expect(ws.jobs.value[1].finishAt).toBeUndefined();
  });

  it('retains metadata cancellation after chapters finish, including restart and unmount', async () => {
    const ws = await workspace('sakura');
    ws.add('slow-metadata', 1, Promise.resolve(), true);
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    const first = ws.metadataCalls[0];
    ws.calls[0].finish();
    await flush();
    expect(ws.jobs.value[0].finishAt).toBeUndefined();
    ws.controls.stopAllWorkers();
    expect(first.signal.aborted).toBe(true);
    expect(first.canUpload()).toBe(false);
    first.resolve();
    await flush();
    expect(ws.jobs.value[0].finishAt).toBeUndefined();

    ws.controls.startAllWorkers();
    await flush();
    expect(ws.metadataCalls).toHaveLength(2);
    const second = ws.metadataCalls[1];
    expect(second.signal.aborted).toBe(false);
    ws.unmount();
    expect(second.signal.aborted).toBe(true);
    expect(second.canUpload()).toBe(false);
    second.resolve();
    await flush();
    expect(ws.jobs.value[0].finishAt).toBeUndefined();
  });

  it('keeps a replacement job metadata attempt when an older promise rejects', async () => {
    const ws = await workspace('sakura');
    ws.add('same', 1, Promise.resolve(), true);
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    const old = ws.metadataCalls[0];
    ws.calls[0].finish();
    await flush();
    ws.controls.deleteJob('web/offline/same');
    ws.add('same', 2, Promise.resolve(), true);
    await flush();
    expect(ws.metadataCalls).toHaveLength(2);
    const current = ws.metadataCalls[1];
    old.reject(new Error('Old translation finished late'));
    await flush();
    expect(ws.jobs.value[0].finishAt).toBeUndefined();

    ws.calls[1].finish('error');
    await flush();
    ws.controls.taskStates.value
      .get('web/offline/same')!
      .updateStatus('0', 'pending');
    ws.controls.runProcessLoop();
    await flush();
    expect(ws.metadataCalls).toHaveLength(2);
    expect(ws.calls).toHaveLength(4);
    expect(old.signal.aborted).toBe(true);
    expect(current.signal.aborted).toBe(false);
    expect(current.canUpload()).toBe(true);
    current.resolve();
    ws.active().forEach((call) => call.finish());
    await flush();
    expect(ws.jobs.value[0].finishAt).toEqual(expect.any(Number));
  });

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

  it('marks the current job finished after another tab replaces the job objects', async () => {
    const ws = await workspace();
    ws.add('synced', 2);
    await flush();
    ws.controls.startAllWorkers();
    await flush();
    expect(ws.active()).toHaveLength(2);

    // localStorage 的 storage 事件会用反序列化的新对象整体替换 jobs
    ws.jobs.value = JSON.parse(JSON.stringify(ws.jobs.value));
    await flush();

    ws.calls[0].progress(1, 0, 2);
    expect(ws.jobs.value[0]).toMatchObject({
      progress: { finished: 1, error: 0, total: 2 },
    });
    ws.active().forEach((call) => call.finish());
    await flush();
    expect(ws.jobs.value[0].finishAt).toEqual(expect.any(Number));
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
