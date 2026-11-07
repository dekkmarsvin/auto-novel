import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateTaskParams } from '../src/domain/translator/tasks/task-descriptor';
import type { TaskExecutionContext } from '../src/domain/translator/tasks/task';

const boundary = vi.hoisted(() => ({
  fetch: vi.fn(),
  metadata: vi.fn(),
  chapter: vi.fn(),
}));
vi.mock('../src/api/client', async () => {
  const { default: ky } = await import('ky');
  return {
    client: ky.create({
      prefix: 'https://books.test/api/',
      fetch: boundary.fetch,
      retry: 0,
    }),
  };
});
vi.mock('../src/api', async () => ({
  WebNovelApi: (await import('../src/api/WebNovelApi')).WebNovelApi,
  formatError: async (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));
vi.mock('../src/external', () => ({
  WebNovelCrawlerApi: {
    getMetadata: boundary.metadata,
    getChapter: boundary.chapter,
  },
}));
vi.mock('../src/stores', () => ({
  useWhoamiStore: () => ({ whoami: { isAdmin: true } }),
}));
// Keep actual HTTP requests; query-cache invalidation is a separate contract.
vi.mock('../src/repos', async () => {
  const { WebNovelApi } = await import('../src/api/WebNovelApi');
  return {
    WebNovelRepo: {
      updateNovel: WebNovelApi.updateNovel,
      createChapter: WebNovelApi.createChapter,
      updateChapter: WebNovelApi.updateChapter,
    },
  };
});

import { WorkPreparer } from '../src/domain/translator/prepare-work';
import { TaskLifecycle } from '../src/domain/translator/task-lifecycle';
import {
  TaskState,
  type UnitStatus,
} from '../src/domain/translator/task-state';
import { WebTranslationTask } from '../src/domain/translator/tasks/web-task';

const params: TranslateTaskParams = {
  level: 'sync',
  forceMetadata: false,
  useBrowserCrawler: true,
  startIndex: 0,
  endIndex: 65535,
};
const combinedGlossary = { 共通: '主題術語', 人名: '小說覆寫' };
const initialToc = [{ chapterId: '1', titleJp: '章一' }];
const refreshedToc = [...initialToc, { chapterId: '2', titleJp: '章二' }];
const sourceMetadata = {
  title: 'Title',
  authors: [],
  type: '连载中',
  attentions: [],
  keywords: [],
  points: null,
  totalCharacters: 0,
  introduction: '',
  toc: refreshedToc.map((item) => ({
    title: item.titleJp,
    chapterId: item.chapterId,
  })),
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
type StopReason = 'stopped' | 'replaced' | 'permission-revoked';

describe('pipeline browser crawler and HTTP boundary', () => {
  let requests: Request[];
  let directoryUpdated: boolean;
  let execution: AbortController;
  let permission: AbortController;
  let lifecycle: TaskLifecycle;
  let context: TaskExecutionContext;
  const stop = (reason: StopReason) => {
    if (reason === 'replaced') lifecycle.abort();
    else if (reason === 'permission-revoked') permission.abort();
    else execution.abort();
  };
  beforeEach(() => {
    requests = [];
    directoryUpdated = false;
    execution = new AbortController();
    permission = new AbortController();
    lifecycle = new TaskLifecycle(1);
    context = {
      signal: lifecycle.signalFor(
        AbortSignal.any([execution.signal, permission.signal]),
      ),
      onLog: vi.fn(),
    };
    boundary.metadata.mockReset().mockResolvedValue(sourceMetadata);
    boundary.chapter
      .mockReset()
      .mockResolvedValue({ paragraphs: ['source from browser'] });
    boundary.fetch.mockReset().mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = new URL(request.url);
      if (
        request.method === 'GET' &&
        /\/translate-v2\/gpt$/.test(url.pathname)
      ) {
        return Response.json({
          titleJp: 'Title',
          introductionJp: '',
          glossaryUuid: 'merged-id',
          glossary: combinedGlossary,
          toc: directoryUpdated ? refreshedToc : initialToc,
        });
      }
      if (request.method === 'GET')
        return Response.json({
          titleJp: 'Title',
          authors: [],
          type: '连载中',
          attentions: [],
          keywords: [],
          introductionJp: '',
          toc: initialToc,
        });
      if (
        request.method === 'PUT' &&
        url.pathname === '/api/novel/pixiv/fixture'
      ) {
        directoryUpdated = true;
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('/chapter-task/1'))
        return Response.json({
          paragraphJp: ['source from server task'],
          glossary: combinedGlossary,
          glossaryId: 'merged-id',
          oldGlossary: {},
        });
      if (url.pathname.endsWith('/translate-v2/gpt/chapter/1'))
        return Response.json({ jp: 1, zh: 1 });
      return new Response(null, { status: 204 });
    });
  });

  it('crawls only when execution initializes, refreshes before its snapshot and passes the site glossary to shared work', async () => {
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
    await Promise.resolve();
    expect(requests).toEqual([]);
    expect(boundary.metadata).not.toHaveBeenCalled();
    expect(boundary.chapter).not.toHaveBeenCalled();
    await task.initialize(context);
    expect(task.initialized).toBe(true);
    expect(task.chapters.map((chapter) => chapter.chapterId)).toEqual([
      '1',
      '2',
    ]);
    const sourceWrite = requests.findIndex(
      (request) => request.method === 'PUT',
    );
    const snapshot = requests.findIndex((request) =>
      request.url.endsWith('/translate-v2/gpt'),
    );
    expect(sourceWrite).toBeGreaterThan(0);
    expect(snapshot).toBeGreaterThan(sourceWrite);
    const state = new TaskState();
    state.initialize(task.chapters, task.metadataUnit);
    const tracker = {
      onUnitStatus: (id: string, status: UnitStatus) =>
        state.updateStatus(id, status),
      onLog: context.onLog,
    };
    const work = await new WorkPreparer(task).prepareUnit(
      state.chapters[0],
      tracker,
      context.signal,
    );
    expect(work).toMatchObject({
      lines: ['source from server task'],
      glossary: combinedGlossary,
      trustedOnly: true,
    });
    expect(boundary.chapter).toHaveBeenCalledOnce();
    const chapterTasks = requests.filter((request) =>
      request.url.includes('/chapter-task/'),
    );
    expect(chapterTasks).toHaveLength(1);
    expect(new URL(chapterTasks[0].url).searchParams.get('sync')).toBe('false');
    expect(
      requests.some(
        (request) =>
          request.method === 'PUT' && request.url.endsWith('/chapter/1'),
      ),
    ).toBe(true);
    await work!.onComplete({ lines: ['translated'], failed: [] });
    const upload = requests.find((request) =>
      request.url.endsWith('/translate-v2/gpt/chapter/1'),
    )!;
    expect(await upload.json()).toMatchObject({
      glossaryId: 'merged-id',
      paragraphsZh: ['translated'],
    });
    expect(state.chapters[0].status).toBe('done');
    expect(upload.signal.aborted).toBe(false);
    execution.abort();
    // Completed units release their parent cancellation listener.
    expect(upload.signal.aborted).toBe(false);
  });

  it.each<StopReason>(['stopped', 'replaced', 'permission-revoked'])(
    'cancels the actual chapter upload while it is still pending after %s',
    async (reason) => {
      const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
      await task.initialize(context);
      const state = new TaskState();
      state.initialize(task.chapters, task.metadataUnit);
      const work = await new WorkPreparer(task).prepareUnit(
        state.chapters[0],
        {
          onUnitStatus: (id, status) => state.updateStatus(id, status),
          onLog: context.onLog,
        },
        context.signal,
      );
      const uploadStarted = deferred<Request>();
      boundary.fetch.mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        uploadStarted.resolve(request);
        return new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener(
            'abort',
            () => reject(request.signal.reason),
            { once: true },
          );
        });
      });
      const saving = work!.onComplete({ lines: ['translated'], failed: [] });
      const rejected = expect(saving).rejects.toMatchObject({
        name: 'AbortError',
      });
      const request = await uploadStarted.promise;
      expect(request.url).toContain('/translate-v2/gpt/chapter/1');
      expect(request.signal.aborted).toBe(false);
      stop(reason);
      await rejected;
      expect(request.signal.aborted).toBe(true);
      expect(state.chapters[0].status).not.toBe('done');
    },
  );

  it('keeps server sync enabled when browser crawling is disabled', async () => {
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', {
      ...params,
      useBrowserCrawler: false,
    });
    await task.initialize(context);
    const prepared = await task.prepareUnit(
      { kind: 'chapter', chapterId: '1' },
      context,
    );
    expect(prepared.glossary).toEqual(combinedGlossary);
    const chapterTask = requests.find((request) =>
      request.url.includes('/chapter-task/'),
    )!;
    expect(new URL(chapterTask.url).searchParams.get('sync')).toBe('true');
    expect(boundary.metadata).not.toHaveBeenCalled();
    expect(boundary.chapter).not.toHaveBeenCalled();
  });

  it.each<StopReason>(['stopped', 'replaced', 'permission-revoked'])(
    'does not mutate source metadata or load a translation snapshot after %s',
    async (reason) => {
      const metadata = deferred<typeof sourceMetadata>();
      boundary.metadata.mockReturnValue(metadata.promise);
      const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
      const operation = task.initialize(context);
      const rejected = expect(operation).rejects.toMatchObject({
        name: 'AbortError',
      });
      await vi.waitFor(() => expect(boundary.metadata).toHaveBeenCalledOnce());
      stop(reason);
      metadata.resolve(sourceMetadata);
      await rejected;
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
      expect(
        requests.some((request) => request.url.includes('/translate-v2/')),
      ).toBe(false);
      expect(task.initialized).toBe(false);
    },
  );

  it.each<StopReason>(['stopped', 'replaced', 'permission-revoked'])(
    'does not create a chapter or fetch translation work when source crawling finishes after %s',
    async (reason) => {
      const chapter = deferred<{ paragraphs: string[] }>();
      boundary.chapter.mockReturnValue(chapter.promise);
      const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
      await task.initialize(context);
      requests = [];
      const operation = task.prepareUnit(
        { kind: 'chapter', chapterId: '1' },
        context,
      );
      const rejected = expect(operation).rejects.toMatchObject({
        name: 'AbortError',
      });
      await vi.waitFor(() => expect(boundary.chapter).toHaveBeenCalledOnce());
      stop(reason);
      chapter.resolve({ paragraphs: ['late source'] });
      await rejected;
      expect(requests).toEqual([]);
    },
  );

  it('does not fall back from a missing source-chapter update to creation after permission is revoked', async () => {
    const fallback = boundary.fetch.getMockImplementation()!;
    boundary.fetch.mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'PUT' && request.url.endsWith('/chapter/1')) {
        requests.push(request);
        permission.abort();
        return new Response('章节不存在', { status: 404 });
      }
      return fallback(input, init);
    });
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
    await task.initialize(context);
    requests = [];
    await expect(
      task.prepareUnit({ kind: 'chapter', chapterId: '1' }, context),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests.map((request) => request.method)).toEqual(['PUT']);
  });
});
