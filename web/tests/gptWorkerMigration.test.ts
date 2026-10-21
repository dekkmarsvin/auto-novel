import { describe, expect, it, vi } from 'vitest';
import {
  gptWorkerMigrationKey,
  migrateGptWorkers,
} from '../src/stores/migrateGptWorkers';

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
  return { values, storage };
}

describe('retired GPT worker import', () => {
  it('imports workers before retirement without changing original jobs, history or bytes', () => {
    const source = {
      workers: [oldWorker],
      jobs: [{ task: 'local/queued', createAt: 1 }],
      uncompletedJobs: [{ task: 'local/finished', createAt: 2 }],
      extra: 'retained',
    };
    const { values, storage } = browserStorage(source);
    const original = values.get(sourceKey);
    expect(migrateGptWorkers(storage)).toBe(true);
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

  it('preserves existing profiles and queues, deduplicates connections and deterministically renames conflicting workers', () => {
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
    const { values, storage } = browserStorage(source, target);
    expect(migrateGptWorkers(storage)).toBe(true);
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
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!)).toEqual(result);
  });

  it('normalizes historical API defaults without altering the retired source and skips retired ChatGPT-web workers', () => {
    const source = {
      workers: [
        { id: 'obsolete-web', type: 'web' },
        { ...oldWorker, endpoint: '', model: undefined },
        { ...oldWorker, id: 'alias', model: 'gpt-3.5' },
      ],
    };
    const { values, storage } = browserStorage(source);
    const original = values.get(sourceKey);
    expect(migrateGptWorkers(storage)).toBe(true);
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

  it('does not restore workers intentionally deleted after a successful import', () => {
    const { values, storage } = browserStorage();
    expect(migrateGptWorkers(storage)).toBe(true);
    values.set(targetKey, JSON.stringify({ workers: [] }));
    storage.setItem.mockClear();
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(values.get(targetKey)!).workers).toEqual([]);
  });

  it.each([
    [sourceKey, '{bad-json'],
    [sourceKey, '{"workers":{}}'],
    [sourceKey, '{"workers":[null]}'],
    [targetKey, '{bad-json'],
    [targetKey, '{"workers":[{}]}'],
  ])('leaves invalid input at %s intact and unmarked for retry', (key, raw) => {
    const { values, storage } = browserStorage();
    values.set(key, raw);
    const original = new Map(values);
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values).toEqual(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not partially import valid workers before encountering an invalid old worker', () => {
    const { values, storage } = browserStorage({ workers: [oldWorker, {}] });
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values.has(targetKey)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
  });

  it('can retry a quota failure without losing the source', () => {
    const { values, storage } = browserStorage();
    const original = values.get(sourceKey);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(values.get(sourceKey)).toBe(original);
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('deduplicates a retry after writing workers but failing to write the completion marker', () => {
    const { values, storage } = browserStorage();
    storage.setItem.mockImplementation((key, value) => {
      if (key === gptWorkerMigrationKey) throw new Error('marker denied');
      values.set(key, value);
    });
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
    storage.setItem.mockImplementation((key, value) => {
      values.set(key, value);
    });
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('requires a successful target readback before marking the import complete', () => {
    const { values, storage } = browserStorage();
    storage.setItem.mockImplementationOnce(() => {});
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(values.has(targetKey)).toBe(false);
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(JSON.parse(values.get(targetKey)!).workers).toHaveLength(1);
  });

  it('does not overwrite a concurrently changed target snapshot', () => {
    const { values, storage } = browserStorage();
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
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(values.get(targetKey)).toBe(concurrent);
    expect(values.has(gptWorkerMigrationKey)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('can retry when accessing browser storage is temporarily denied', () => {
    const { values, storage } = browserStorage();
    storage.getItem.mockImplementationOnce(() => {
      throw new Error('access denied');
    });
    expect(migrateGptWorkers(storage)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(migrateGptWorkers(storage)).toBe(true);
    expect(values.get(gptWorkerMigrationKey)).toBe('1');
  });
});
