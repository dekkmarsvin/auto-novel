import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { TranslateRequest } from '@auto-novel/translator';
import type {
  PreparedUnit,
  TranslationTask,
} from '../src/domain/translator/tasks/task';
import { useWorkspaceRuntime } from '../src/pages/workspace/useWorkspaceRuntime';

const boundary = vi.hoisted(() => ({
  workerStore: null as unknown,
  jobStore: null as unknown,
  tasks: new Map<string, TranslationTask>(),
  createTranslator: vi.fn(),
}));
vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>();
  return { ...vue, onUnmounted: vue.onScopeDispose };
});
vi.mock('@/stores', () => ({
  useWorkspaceStore: (id: string) =>
    id === 'gpt-pipeline' ? boundary.workerStore : boundary.jobStore,
}));
vi.mock('@novelia/web-kit', () => ({ Toast: { error: vi.fn() } }));
vi.mock('@/pages/workspace/useWorkspaceLog', () => ({
  useWorkspaceLog: () => ({ logs: [], appendLog: vi.fn(), clearLogs: vi.fn() }),
}));
vi.mock('@/domain/translator/tasks/create-task', () => ({
  createTranslationTask: (desc: { volumeId: string }) =>
    boundary.tasks.get(desc.volumeId),
}));
vi.mock('@/domain/translator/segment-cache', () => ({
  IndexedDbSegmentCache: class {},
}));
// Keep the real queue, cancellation and settlement implementation. Only model
// creation crosses a boundary; no model request or browser database is used.
vi.mock('@auto-novel/translator', async (original) => ({
  ...(await original<typeof import('@auto-novel/translator')>()),
  createTranslator: boundary.createTranslator,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function task(id: string, chapterCount = 1) {
  const saves = vi.fn();
  const value = {
    type: 'local' as const,
    initialized: false,
    chapters: Array.from({ length: chapterCount }, (_, order) => ({
      kind: 'chapter' as const,
      chapterId: String(order),
      title: String(order),
      order,
      completed: false,
    })),
    initialize: vi.fn(async () => {
      value.initialized = true;
    }),
    prepareUnit: vi.fn<TranslationTask['prepareUnit']>(async (unit) => {
      const chapterId = unit.kind === 'chapter' ? unit.chapterId : 'metadata';
      return {
        lines: [`${id}/${chapterId} 共通 人名`],
        glossary: { 共通: '主題術語', 人名: '小說覆寫' },
        save: async (translated) => {
          saves(chapterId, translated);
        },
      };
    }),
    saves,
  } satisfies TranslationTask & { saves: typeof saves };
  return value;
}

const scopes: EffectScope[] = [];
afterEach(async () => {
  scopes.splice(0).forEach((scope) => scope.stop());
  await nextTick();
  vi.clearAllMocks();
});

function workspace(
  tasks: Record<string, TranslationTask>,
  initialized = Promise.resolve(),
) {
  boundary.tasks = new Map(Object.entries(tasks));
  const workerStore = {
    initialized,
    storageReady: ref(false),
    persistenceError: ref<string>(),
    ref: ref({
      workers: [
        {
          id: 'offline',
          concurrency: 2,
          endpoint: 'https://model.test',
          key: 'synthetic-key',
          model: 'fixture',
        },
      ],
    }),
  };
  const jobStore = {
    ref: ref({
      jobs: Object.keys(tasks).map((id) => ({
        task: `local/${id}`,
        description: id,
        createAt: 1,
        finishAt: undefined as number | undefined,
      })),
    }),
  };
  boundary.workerStore = workerStore;
  boundary.jobStore = jobStore;
  const calls: { request: TranslateRequest; complete(): void }[] = [];
  boundary.createTranslator.mockResolvedValue({
    trusted: true,
    translate: (request: TranslateRequest) =>
      new Promise<readonly string[]>((resolve, reject) => {
        const signal = request.signal!;
        signal.throwIfAborted();
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        calls.push({
          request,
          complete() {
            signal.removeEventListener('abort', abort);
            resolve(request.lines.map((line) => `译文:${line}`));
          },
        });
      }),
  });
  const scope = effectScope();
  scopes.push(scope);
  const runtime = scope.run(() => useWorkspaceRuntime('gpt'))!;
  return { runtime, workerStore, jobStore, calls, scope };
}

describe('pipeline workspace integration', () => {
  it('waits for migration before starting workers and exposes persistence state', async () => {
    const initialization = deferred<void>();
    const active = task('active');
    const ws = workspace({ active }, initialization.promise);
    const start = ws.runtime.startAllWorkers();
    await nextTick();
    expect(boundary.createTranslator).not.toHaveBeenCalled();
    expect(active.initialize).not.toHaveBeenCalled();
    expect(ws.runtime.storageReady).toBe(ws.workerStore.storageReady);
    expect(ws.runtime.persistenceError).toBe(ws.workerStore.persistenceError);
    initialization.resolve();
    await start;
    await vi.waitFor(() => expect(ws.calls).toHaveLength(1));
    ws.calls[0].complete();
    await vi.waitFor(() => expect(active.saves).toHaveBeenCalledOnce());
  });

  it('does not start a worker after unmount while migration is pending', async () => {
    const initialization = deferred<void>();
    const ws = workspace({ active: task('active') }, initialization.promise);
    const start = ws.runtime.startAllWorkers();
    ws.scope.stop();
    initialization.resolve();
    await start;
    expect(boundary.createTranslator).not.toHaveBeenCalled();
    expect(ws.runtime.workerStates.value.size).toBe(0);
  });

  it('uses pipeline backpressure and preserves the merged glossary through settlement', async () => {
    const active = task('active', 20);
    const ws = workspace({ active });
    await ws.runtime.startWorker('offline');
    await vi.waitFor(() => expect(ws.calls).toHaveLength(2));
    // The new queue follows worker concurrency rather than the retired fixed
    // 66-chapter window. Blocked models must not eagerly prepare all chapters.
    expect(active.prepareUnit.mock.calls.length).toBeLessThan(20);
    expect(ws.calls[0].request.context?.glossary).toEqual({
      共通: '主題術語',
      人名: '小說覆寫',
    });
    ws.calls[0].complete();
    await vi.waitFor(() => expect(ws.calls).toHaveLength(3));
    expect(active.saves).toHaveBeenCalledExactlyOnceWith('0', [
      '译文:active/0 共通 人名',
    ]);
    ws.scope.stop();
    expect(ws.calls.every(({ request }) => request.signal!.aborted)).toBe(true);
    ws.calls.forEach((call) => call.complete());
    await nextTick();
    expect(active.saves).toHaveBeenCalledOnce();
  });

  it('finishes the current stored job after another tab replaces its objects', async () => {
    const active = task('active');
    const ws = workspace({ active });
    await ws.runtime.startWorker('offline');
    await vi.waitFor(() => expect(ws.calls).toHaveLength(1));
    const oldJob = ws.jobStore.ref.value.jobs[0];
    ws.jobStore.ref.value.jobs = ws.jobStore.ref.value.jobs.map((job) => ({
      ...job,
    }));
    ws.calls[0].complete();
    await vi.waitFor(() =>
      expect(ws.jobStore.ref.value.jobs[0].finishAt).toEqual(
        expect.any(Number),
      ),
    );
    expect(oldJob.finishAt).toBeUndefined();
    expect(active.initialize).toHaveBeenCalledOnce();
    expect(active.saves).toHaveBeenCalledOnce();
  });

  it('cancels a replaced task synchronously and ignores a late source result', async () => {
    const old = task('old');
    const replacement = task('replacement');
    const source = deferred<PreparedUnit>();
    old.prepareUnit.mockReturnValueOnce(source.promise);
    const ws = workspace({ active: old });
    await ws.runtime.startWorker('offline');
    await vi.waitFor(() => expect(old.prepareUnit).toHaveBeenCalledOnce());
    const signal = old.prepareUnit.mock.calls[0][1].signal;
    boundary.tasks.set('active', replacement);
    ws.jobStore.ref.value.jobs[0].createAt = 2;
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(ws.calls).toHaveLength(1));
    ws.calls[0].complete();
    await vi.waitFor(() => expect(replacement.saves).toHaveBeenCalledOnce());
    source.resolve({ lines: ['late'], glossary: {}, save: old.saves });
    await source.promise;
    await nextTick();
    expect(old.saves).not.toHaveBeenCalled();
    expect(
      ws.runtime.taskStates.value.get('local/active')?.chapters[0].status,
    ).toBe('done');
  });
});
