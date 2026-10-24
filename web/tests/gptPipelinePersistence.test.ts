import { effectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGptPipelinePersistence } from '../src/stores/gptPipelinePersistence';
import {
  gptWorkerMigrationKey,
  migrateGptWorkers,
} from '../src/stores/migrateGptWorkers';
import {
  gptPipelineLockName,
  type WorkspaceLocks,
} from '../src/stores/workspaceLock';

const key = 'workspace-gpt-pipeline';
const defaults = { workers: [] as { id: string; key: string }[], jobs: [] };
const original = { ...defaults, workers: [{ id: 'saved', key: 'old' }] };

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  writes: [string, string][] = [];
  rejectWrites = false;
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
    if (this.rejectWrites) throw new Error('quota');
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

/** Shared origin lock with controllable acquisition, rather than a no-op mock. */
class QueuedLocks implements WorkspaceLocks {
  names: string[] = [];
  private paused = false;
  private active = false;
  private queue: (() => Promise<void>)[] = [];

  request<T>(name: string, action: () => T | Promise<T>): Promise<T> {
    this.names.push(name);
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await action());
        } catch (error) {
          reject(error);
        }
      });
      this.run();
    });
  }

  hold() {
    this.paused = true;
    return () => {
      this.paused = false;
      this.run();
    };
  }

  private run() {
    if (this.paused || this.active || !this.queue.length) return;
    this.active = true;
    void this.queue.shift()!().finally(() => {
      this.active = false;
      this.run();
    });
  }
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

function setup(raw = JSON.stringify(original)) {
  const storage = new MemoryStorage();
  storage.values.set(key, raw);
  storage.values.set('workspace-gpt', 'retained source bytes');
  return { storage, locks: new QueuedLocks() };
}

function context(
  storage: MemoryStorage,
  locks: WorkspaceLocks | undefined,
  initialize?: () => Promise<boolean>,
) {
  const browser = Object.assign(new EventTarget(), { localStorage: storage });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('navigator', { locks });
  const scope = effectScope();
  const store = scope.run(() =>
    useGptPipelinePersistence(defaults, { storage, locks, initialize }),
  )!;
  cleanups.push(() => scope.stop());
  const event = (staleRaw: string | null = null) => {
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: key },
      storageArea: { value: storage },
      newValue: { value: staleRaw },
    });
    browser.dispatchEvent(event);
  };
  return { ...store, event };
}

describe('GPT Pipeline coordinated persistence', () => {
  it('hydrates only after initialization and preserves other storage keys', async () => {
    const { storage, locks } = setup();
    let finish!: (value: boolean) => void;
    const store = context(
      storage,
      locks,
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    expect(store.ready.value).toBe(false);
    finish(true);
    await store.initialized;
    expect(store.ready.value).toBe(true);
    expect(store.ref.value).toEqual(original);
    expect(storage.writes).toEqual([]);
    expect(storage.getItem('workspace-gpt')).toBe('retained source bytes');
  });

  it('serializes rapid same-tab direct edits without restoring an older ref', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks);
    await store.initialized;
    const release = locks.hold();
    store.ref.value.workers[0].key = 'first';
    store.ref.value.workers[0].key = 'latest';
    release();
    expect(await store.persisted()).toBe(true);
    expect(store.ref.value.workers[0].key).toBe('latest');
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('latest');
    expect(new Set(locks.names)).toEqual(new Set([gptPipelineLockName]));
  });

  it('keeps a newer local edit visible while its earlier write completes', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks);
    await store.initialized;
    let firstSaved!: () => void;
    const firstWrite = new Promise<void>((resolve) => (firstSaved = resolve));
    let releaseSecond!: () => void;
    const setItem = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementationOnce((key, value) => {
      setItem(key, value);
      releaseSecond = locks.hold();
      firstSaved();
    });
    store.ref.value.workers[0].key = 'first';
    store.ref.value.workers[0].key = 'latest';
    await firstWrite;
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('first');
    expect(store.ref.value.workers[0].key).toBe('latest');
    releaseSecond();
    expect(await store.persisted()).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('latest');
  });

  it('rejects the stale ordinary writer after another context saves first', async () => {
    const { storage, locks } = setup();
    const a = context(storage, locks);
    const b = context(storage, locks);
    await Promise.all([a.initialized, b.initialized]);
    a.ref.value.workers[0].key = 'new-secret';
    expect(await a.persisted()).toBe(true);
    b.ref.value.workers[0].key = 'stale-edit';
    expect(await b.persisted()).toBe(false);
    expect(b.error.value).toContain('其他标签页');
    expect(b.ref.value.workers[0].key).toBe('new-secret');
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('new-secret');
    b.ref.value.workers[0].key = 'explicit-retry';
    expect(await b.persisted()).toBe(true);
  });

  it('does not delete imported workers when an existing tab edits a stale ref', async () => {
    const currentWorker = {
      ...original.workers[0],
      endpoint: 'https://current.test/v1',
      model: 'current-model',
      concurrency: 4,
      profile: { id: 'deepseek', values: { reasoning_effort: 'high' } },
    };
    const oldWorker = {
      id: 'imported',
      endpoint: 'https://legacy.test/v1',
      model: 'legacy-model',
      key: 'legacy-key',
    };
    const { storage, locks } = setup(
      JSON.stringify({ ...original, workers: [currentWorker] }),
    );
    const source = JSON.stringify({
      workers: [oldWorker],
      jobs: [{ task: 'local/retained', createAt: 1 }],
      uncompletedJobs: [{ task: 'local/history', createAt: 2 }],
    });
    storage.values.set('workspace-gpt', source);
    const existing = context(storage, locks);
    await existing.initialized;
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    existing.ref.value.workers[0].key = 'stale';
    expect(await existing.persisted()).toBe(false);
    expect(JSON.parse(storage.getItem(key)!).workers).toEqual([
      currentWorker,
      { ...oldWorker, concurrency: 1, profile: { id: 'openai' } },
    ]);
    expect(storage.getItem('workspace-gpt')).toBe(source);
    expect(storage.getItem(gptWorkerMigrationKey)).toBe('1');
  });

  it('does not let a storage event legitimize an already queued stale edit', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks);
    await store.initialized;
    const release = locks.hold();
    store.ref.value.workers[0].key = 'queued-old-edit';
    const remote = JSON.stringify({
      ...original,
      workers: [{ id: 'saved', key: 'remote' }],
    });
    storage.values.set(key, remote);
    // The event requests the lock before the local promise queue acquires it.
    store.event(remote);
    release();
    expect(await store.persisted()).toBe(false);
    expect(storage.getItem(key)).toBe(remote);
    expect(storage.writes).toEqual([]);
  });

  it('rereads current storage when an old storage event arrives late', async () => {
    const { storage, locks } = setup();
    const a = context(storage, locks);
    const b = context(storage, locks);
    await Promise.all([a.initialized, b.initialized]);
    a.ref.value.workers[0].key = 'latest';
    expect(await a.persisted()).toBe(true);
    b.event(JSON.stringify(original));
    await locks.request(gptPipelineLockName, () => {});
    expect(b.ref.value.workers[0].key).toBe('latest');
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('latest');
  });

  it('coordinates direct array replacement for reordering and deleting workers', async () => {
    const { storage, locks } = setup(
      JSON.stringify({
        ...defaults,
        workers: [
          { id: 'first', key: 'one' },
          { id: 'second', key: 'two' },
        ],
      }),
    );
    const store = context(storage, locks);
    await store.initialized;
    store.ref.value.workers = [...store.ref.value.workers].reverse();
    expect(await store.persisted()).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).workers[0].id).toBe('second');
    store.ref.value.workers = store.ref.value.workers.filter(
      (worker) => worker.id !== 'first',
    );
    expect(await store.persisted()).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).workers).toEqual([
      { id: 'second', key: 'two' },
    ]);
  });

  it.each(['unavailable', 'rejected'] as const)(
    'does not write when browser locks are %s',
    async (failure) => {
      const { storage } = setup();
      const locks: WorkspaceLocks | undefined =
        failure === 'unavailable'
          ? undefined
          : {
              request: async () => {
                throw new Error('denied');
              },
            };
      const store = context(storage, locks);
      await store.initialized;
      expect(store.ready.value).toBe(true);
      expect(store.error.value).toBeTruthy();
      store.ref.value.workers.push({ id: 'new', key: 'new' });
      expect(await store.persisted()).toBe(false);
      expect(storage.getItem(key)).toBe(JSON.stringify(original));
      expect(storage.writes).toEqual([]);
    },
  );

  it.each(['{bad-json', '{"workers":{}}'])(
    'keeps malformed persisted data intact: %s',
    async (raw) => {
      const { storage, locks } = setup(raw);
      const store = context(storage, locks);
      await store.initialized;
      store.ref.value.workers.push({ id: 'new', key: 'new' });
      expect(await store.persisted()).toBe(false);
      expect(storage.getItem(key)).toBe(raw);
      expect(storage.writes).toEqual([]);
    },
  );

  it('reports quota failure and allows a later explicit save retry', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks);
    await store.initialized;
    storage.rejectWrites = true;
    store.ref.value.workers[0].key = 'failed';
    expect(await store.persisted()).toBe(false);
    expect(store.error.value).toBeTruthy();
    expect(storage.getItem(key)).toBe(JSON.stringify(original));
    storage.rejectWrites = false;
    store.ref.value.workers[0].key = 'retry';
    expect(await store.persisted()).toBe(true);
    expect(JSON.parse(storage.getItem(key)!).workers[0].key).toBe('retry');
  });

  it('does not report a silently ignored write as persisted', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks);
    await store.initialized;
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {});
    store.ref.value.workers[0].key = 'ignored';
    expect(await store.persisted()).toBe(false);
    expect(store.ref.value).toEqual(original);
    expect(storage.getItem(key)).toBe(JSON.stringify(original));
  });

  it('keeps initialization failure visible but permits a later guarded save', async () => {
    const { storage, locks } = setup();
    const store = context(storage, locks, async () => false);
    await store.initialized;
    expect(store.ready.value).toBe(true);
    expect(store.error.value).toBeTruthy();
    expect(await store.persisted()).toBe(false);
    store.ref.value.workers[0].key = 'explicit-new-save';
    expect(await store.persisted()).toBe(true);
    expect(store.error.value).toBeUndefined();
  });
});
