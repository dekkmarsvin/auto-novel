import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The native audio keep-alive is unrelated to storage; both lazy and storage
// helpers remain production implementations so the old lifetime bug is observable.
vi.mock('../src/util', async (importOriginal) => {
  vi.stubGlobal('Audio', class {});
  return importOriginal();
});

import { useGptPipelineWorkspaceStore } from '../src/stores/useWorkspaceStore';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
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

afterEach(() => vi.unstubAllGlobals());

describe('workspace persistence after leaving the first page', () => {
  it('keeps saving workers and receiving storage events after the page scope is disposed', async () => {
    const storage = new MemoryStorage();
    const browser = Object.assign(new EventTarget(), { localStorage: storage });
    vi.stubGlobal('window', browser);
    const worker = {
      id: 'saved',
      model: 'model',
      endpoint: 'https://chosen.test/v1',
      key: 'synthetic-key',
      concurrency: 2,
      profile: {
        id: 'gemini' as const,
        values: { reasoning_effort: 'minimal' },
      },
    };
    const saved = { workers: [worker], jobs: [], uncompletedJobs: [] };
    storage.setItem('workspace-gpt-pipeline', JSON.stringify(saved));
    storage.setItem('workspace-gpt', '{"retained":"old workspace"}');
    const page = Vue.effectScope();
    const store = page.run(() => useGptPipelineWorkspaceStore())!;
    page.stop();

    store.addWorker({ ...worker, id: 'added-after-navigation' });
    await Vue.nextTick();
    expect(
      JSON.parse(storage.getItem('workspace-gpt-pipeline')!).workers,
    ).toEqual([worker, { ...worker, id: 'added-after-navigation' }]);
    const remote = { ...saved, workers: [{ ...worker, concurrency: 3 }] };
    const raw = JSON.stringify(remote);
    storage.setItem('workspace-gpt-pipeline', raw);
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: 'workspace-gpt-pipeline' },
      storageArea: { value: storage },
      newValue: { value: raw },
    });
    browser.dispatchEvent(event);
    await Vue.nextTick();
    expect(useGptPipelineWorkspaceStore()).toBe(store);
    expect(store.ref.value).toEqual(remote);
    store.ref.value.workers[0].concurrency = 4;
    await Vue.nextTick();
    expect(
      JSON.parse(storage.getItem('workspace-gpt-pipeline')!).workers[0],
    ).toEqual({
      ...worker,
      concurrency: 4,
    });
    expect(storage.getItem('workspace-gpt')).toBe(
      '{"retained":"old workspace"}',
    );
  });
});
