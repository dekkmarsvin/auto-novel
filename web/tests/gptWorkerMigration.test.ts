import { describe, expect, it, vi } from 'vitest';
import {
  gptWorkerMigrationKey,
  migrateGptWorkers,
} from '../src/stores/migrateGptWorkers';

import {
  gptPipelineLockName,
  type WorkspaceLocks,
} from '../src/stores/workspaceLock';

class SerialLocks implements WorkspaceLocks {
  private busy = false;
  private queue: (() => void)[] = [];
  request<T>(_name: string, action: () => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.busy = true;
        let result: T | Promise<T>;
        try {
          result = action();
        } catch (error) {
          result = Promise.reject(error);
        }
        Promise.resolve(result)
          .then(resolve, reject)
          .finally(() => {
            this.busy = false;
            this.queue.shift()?.();
          });
      };
      if (this.busy) this.queue.push(run);
      else run();
    });
  }
}

const sourceKey = 'workspace-gpt';
const targetKey = 'workspace-gpt-pipeline';
const oldWorker = {
  id: 'chosen',
  endpoint: 'https://chosen.test/v1',
  model: 'chosen-model',
  key: 'synthetic-old-key',
};

function browserStorage(
  source: unknown = { workers: [oldWorker] },
  target?: unknown,
) {
  const values = new Map<string, string>();
  values.set(sourceKey, JSON.stringify(source));
  if (target !== undefined) values.set(targetKey, JSON.stringify(target));
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  return { values, storage, locks: new SerialLocks() };
}

describe('retired GPT worker import', () => {
  it('imports workers before retirement without changing original jobs, history or bytes', async () => {
    const source = {
      workers: [oldWorker],
      jobs: [{ task: 'local/queued', createAt: 1 }],
      uncompletedJobs: [{ task: 'local/finished', createAt: 2 }],
      extra: 'retained',
    };
    const { values, storage, locks } = browserStorage(source);
    const original = values.get(sourceKey);
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!)).toEqual({
      workers: [{ ...oldWorker, concurrency: 1, profile: { id: 'openai' } }],
      jobs: [],
      uncompletedJobs: [],
    });
    expect(values.get(sourceKey)).toBe(original);
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([
      targetKey,
      gptWorkerMigrationKey,
    ]);
  });

  it('preserves existing profiles and queues, deduplicates connections and deterministically renames conflicting workers', async () => {
    const current = {
      ...oldWorker,
      key: 'synthetic-current-key',
      concurrency: 7,
      profile: { id: 'gemini', values: { reasoning_effort: 'minimal' } },
    };
    const target = {
      workers: [current, { ...current, id: 'chosen（旧版）' }],
      jobs: [{ task: 'retained-target-job' }],
      uncompletedJobs: [{ task: 'retained-target-history' }],
      extra: { retained: true },
    };
    const source = {
      workers: [
        { ...current, id: 'another-name', concurrency: 1 },
        oldWorker,
        { ...oldWorker, endpoint: 'https://another.test', concurrency: 3 },
      ],
    };
    const { values, storage, locks } = browserStorage(source, target);
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    const result = JSON.parse(values.get(targetKey)!);
    expect(result).toEqual({
      ...target,
      workers: [
        ...target.workers,
        {
          ...oldWorker,
          id: 'chosen（旧版 2）',
          concurrency: 1,
          profile: { id: 'openai' },
        },
        {
          ...oldWorker,
          id: 'chosen（旧版 3）',
          endpoint: 'https://another.test',
          concurrency: 3,
          profile: { id: 'openai' },
        },
      ],
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!)).toEqual(result);
  });

  it('normalizes historical API defaults without altering the retired source and skips retired ChatGPT-web workers', async () => {
    const source = {
      workers: [
        { id: 'obsolete-web', type: 'web' },
        { ...oldWorker, endpoint: '', model: undefined },
        { ...oldWorker, id: 'alias', model: 'gpt-3.5' },
      ],
    };
    const { values, storage, locks } = browserStorage(source);
    const original = values.get(sourceKey);
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toEqual([
      {
        ...oldWorker,
        endpoint: 'https://api.openai.com',
        model: 'gpt-3.5-turbo',
        concurrency: 1,
        profile: { id: 'openai' },
      },
      {
        ...oldWorker,
        id: 'alias',
        model: 'gpt-3.5-turbo',
        concurrency: 1,
        profile: { id: 'openai' },
      },
    ]);
    expect(values.get(sourceKey)).toBe(original);
  });

  it('does not restore workers intentionally deleted after a successful import', async () => {
    const { values, storage, locks } = browserStorage();
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    values.set(targetKey, JSON.stringify({ workers: [] }));
    storage.setItem.mockClear();
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(values.get(targetKey)!).workers).toEqual([]);
  });

  it.each([
    [sourceKey, '{bad-json'],
    [sourceKey, '{"workers":{}}'],
    [sourceKey, '{"workers":[null]}'],
    [targetKey, '{bad-json'],
    [targetKey, '{"workers":[{}]}'],
  ])(
    'leaves invalid input at %s intact and unmarked for retry',
    async (key, raw) => {
      const { values, storage, locks } = browserStorage();
      values.set(key, raw);
      const original = new Map(values);
      expect(await migrateGptWorkers(storage, locks)).toBe(false);
      expect(values).toEqual(original);
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it('does not partially import valid workers before encountering an invalid old worker', async () => {
    const { values, storage, locks } = browserStorage({
      workers: [oldWorker, {}],
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(values.has(targetKey)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
  });

  it('can retry a quota failure without losing the source', async () => {
    const { values, storage, locks } = browserStorage();
    const original = values.get(sourceKey);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(values.get(sourceKey)).toBe(original);
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('deduplicates a retry after writing workers but failing to write the completion marker', async () => {
    const { values, storage, locks } = browserStorage();
    storage.setItem.mockImplementation((key, value) => {
      if (key === gptWorkerMigrationKey) throw new Error('marker denied');
      values.set(key, value);
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
    storage.setItem.mockImplementation((key, value) => {
      values.set(key, value);
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('requires a successful target readback before marking the import complete', async () => {
    const { values, storage, locks } = browserStorage();
    storage.setItem.mockImplementationOnce(() => {});
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(values.has(targetKey)).toBe(false);
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('does not overwrite a concurrently changed target snapshot', async () => {
    const { values, storage, locks } = browserStorage();
    let targetReads = 0;
    const concurrent = JSON.stringify({
      workers: [{ ...oldWorker, key: 'new' }],
    });
    storage.getItem.mockImplementation((key) => {
      if (key === targetKey && ++targetReads === 2) {
        values.set(targetKey, concurrent);
      }
      return values.get(key) ?? null;
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(values.get(targetKey)).toBe(concurrent);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('serializes an edit requested after the final read and before the import write', async () => {
    const current = { ...oldWorker, key: 'current-key', concurrency: 3 };
    const { values, storage, locks } = browserStorage(undefined, {
      workers: [current],
      retained: 'unchanged',
    });
    let reads = 0;
    let edit: Promise<void> | undefined;
    storage.getItem.mockImplementation((key) => {
      // Return the already-read value even if a second browser wants to save
      // immediately afterwards: this is the original check/write race window.
      const snapshot = values.get(key) ?? null;
      if (key === targetKey && ++reads === 2) {
        edit = locks.request(gptPipelineLockName, () => {
          const latest = JSON.parse(values.get(targetKey)!);
          latest.workers[0] = {
            ...latest.workers[0],
            key: 'newer-key',
            profile: { id: 'gemini', values: { thinking: 'high' } },
          };
          storage.setItem(targetKey, JSON.stringify(latest));
        });
      }
      return snapshot;
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    await edit;
    const imported = JSON.parse(values.get(targetKey)!);
    expect(imported.retained).toBe('unchanged');
    expect(imported.workers[0]).toEqual({
      ...current,
      key: 'newer-key',
      profile: { id: 'gemini', values: { thinking: 'high' } },
    });
    expect(imported.workers[1]).toMatchObject({
      ...oldWorker,
      id: 'chosen（旧版）',
    });
    expect(values.get(gptWorkerMigrationKey)).toBe('1');
  });

  it('reads the existing settings only after an earlier save releases the lock', async () => {
    const { values, storage, locks } = browserStorage();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saved = {
      workers: [{ ...oldWorker, key: 'newer-key' }],
      retained: 7,
    };
    const earlierSave = locks.request(gptPipelineLockName, async () => {
      await gate;
      storage.setItem(targetKey, JSON.stringify(saved));
    });
    const importing = migrateGptWorkers(storage, locks);
    expect(storage.getItem).not.toHaveBeenCalled();
    release();
    await earlierSave;
    expect(await importing).toBe(true);
    const result = JSON.parse(values.get(targetKey)!);
    expect(result.workers[0]).toEqual(saved.workers[0]);
    expect(result.retained).toBe(7);
    expect(result.workers).toHaveLength(2);
  });

  it('serializes two importers without duplicate workers or markers', async () => {
    const { values, storage, locks } = browserStorage();
    expect(
      await Promise.all([
        migrateGptWorkers(storage, locks),
        migrateGptWorkers(storage, locks),
      ]),
    ).toEqual([true, true]);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
    expect(
      storage.setItem.mock.calls.filter(([key]) => key === targetKey),
    ).toHaveLength(1);
    expect(
      storage.setItem.mock.calls.filter(
        ([key]) => key === gptWorkerMigrationKey,
      ),
    ).toHaveLength(1);
  });

  it('does not write or mark completion when browser locking is unavailable or denied', async () => {
    const { values, storage } = browserStorage();
    const original = new Map(values);
    vi.stubGlobal('navigator', {});
    expect(await migrateGptWorkers(storage)).toBe(false);
    vi.unstubAllGlobals();
    const denied: WorkspaceLocks = {
      request: () => Promise.reject(new Error('denied')),
    };
    expect(await migrateGptWorkers(storage, denied)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values).toEqual(original);
  });

  it('can retry when accessing browser storage is temporarily denied', async () => {
    const { values, storage, locks } = browserStorage();
    storage.getItem.mockImplementationOnce(() => {
      throw new Error('access denied');
    });
    expect(await migrateGptWorkers(storage, locks)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await migrateGptWorkers(storage, locks)).toBe(true);
    expect(values.get(gptWorkerMigrationKey)).toBe('1');
  });
});
