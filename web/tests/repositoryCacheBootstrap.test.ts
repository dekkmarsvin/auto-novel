import { PiniaColada, useQueryCache } from '@pinia/colada';
import {
  createPinia,
  disposePinia,
  getActivePinia,
  setActivePinia,
} from 'pinia';
import { createApp, shallowRef } from 'vue';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  vi.stubGlobal('window', new EventTarget());
  return {
    createNovel: vi.fn(),
    updateNovel: vi.fn(),
    createVolume: vi.fn(),
    deleteVolume: vi.fn(),
    updateComment: vi.fn(),
  };
});
afterAll(() => vi.unstubAllGlobals());
const whoami = shallowRef({ user: { id: 1 } });
vi.mock('../src/webKit', () => ({ isLocalAuth: false, webKit: { whoami } }));
vi.mock('../src/api', () => ({
  WenkuNovelApi: api,
  CommentApi: api,
  FavoredApi: {},
}));

// Match main's new static route graph: import the real repositories before
// creating a Vue application or installing Pinia. The previous eager singleton
// throws during this collection step, before any page can mount.
setActivePinia(undefined);
const { getQueryCache } = await import('../src/repos/cache');
const { WenkuNovelRepo } = await import('../src/repos/useWenkuNovel');
const { CommentRepo } = await import('../src/repos/useComment');

let pinia: ReturnType<typeof createPinia> | undefined;
afterEach(() => {
  if (pinia) disposePinia(pinia);
  pinia = undefined;
  setActivePinia(undefined);
  vi.clearAllMocks();
});
function install() {
  const app = createApp({});
  pinia = createPinia();
  app.use(pinia);
  app.use(PiniaColada);
  const cache = app.runWithContext(getQueryCache);
  expect(cache).toBe(app.runWithContext(useQueryCache));
  return cache;
}
function seed(
  cache: ReturnType<typeof getQueryCache>,
  key: (string | number)[],
  data: unknown,
) {
  const entry = cache.ensure({
    key,
    query: async () => data,
    staleTime: 60_000,
    gcTime: Infinity,
  });
  cache.setQueryData(key, data);
  expect(entry.stale).toBe(false);
  return entry;
}

describe('static repository imports and installed query-cache mutations', () => {
  it('imports without Pinia and tolerates an early SDK identity change', () => {
    expect(getActivePinia()).toBeUndefined();
    expect(WenkuNovelRepo.updateNovel).toBeTypeOf('function');
    expect(() => {
      whoami.value = { user: { id: 2 } };
    }).not.toThrow();
    expect(getActivePinia()).toBeUndefined();
    expect(api.updateNovel).not.toHaveBeenCalled();
  });

  it('invalidates only the updated Wenku item in the installed cache', async () => {
    const cache = install();
    const changed = seed(cache, ['wenku-novel', 'n1'], { title: 'old' });
    const other = seed(cache, ['wenku-novel', 'n2'], { title: 'other' });
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    api.updateNovel.mockResolvedValue(undefined);
    const body = {
      title: 'edited',
      titleZh: '',
      authors: [],
      artists: [],
      level: '一般向',
      introduction: '',
      keywords: [],
      volumes: [],
    };
    await WenkuNovelRepo.updateNovel('n1', body);
    expect(api.updateNovel).toHaveBeenCalledWith('n1', body);
    expect(invalidate).toHaveBeenCalledWith({
      key: ['wenku-novel', 'n1'],
      exact: true,
    });
    expect(changed.stale).toBe(true);
    expect(other.stale).toBe(false);
  });

  it('retains upload abort and invalidates its captured novel cache on completion', async () => {
    const cache = install();
    const changed = seed(cache, ['wenku-novel', 'n1'], { title: 'novel' });
    const abort = vi.fn();
    api.createVolume.mockReturnValue({
      abort,
      promise: Promise.resolve('stored'),
    });
    const task = WenkuNovelRepo.createVolume(
      'n1',
      'v1',
      'jp',
      new File(['text'], 'v1.txt'),
      vi.fn(),
    );
    expect(task.abort).toBe(abort);
    await expect(task.promise).resolves.toBe('stored');
    expect(changed.stale).toBe(true);
  });

  it('updates and invalidates only the current viewer/site comment cache', async () => {
    const cache = install();
    const id = whoami.value.user.id;
    const comment = { id: 7, content: 'old', updatedAt: 'before' };
    const changed = seed(cache, ['comment-list', id, 'site', 'roots', 1], {
      total: 1,
      items: [comment],
    });
    const other = seed(cache, ['comment-list', id, 'other', 'roots', 1], {
      total: 1,
      items: [comment],
    });
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    api.updateComment.mockResolvedValue({
      ...comment,
      content: 'edited',
      updatedAt: 'now',
    });
    await CommentRepo.updateComment(7, 'site', 'edited');
    expect(changed.state.value.data).toMatchObject({
      items: [{ content: 'edited', updatedAt: 'now' }],
    });
    expect(other.state.value.data).toMatchObject({
      items: [{ content: 'old' }],
    });
    expect(invalidate).toHaveBeenCalledWith({
      key: ['comment-list', id, 'site'],
    });
    expect(changed.stale).toBe(true);
    expect(other.stale).toBe(false);
  });
});
