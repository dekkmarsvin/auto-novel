import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateTaskParams } from '../src/model/Translator';
import type { TaskExecutionContext } from '../src/domain/translator/TranslationTask/types';

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
// Query-cache invalidation is not part of this HTTP mutation/cancellation contract.
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

import { WebTranslationTask } from '../src/domain/translator/TranslationTask/WebTranslationTask';

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

describe('pipeline browser crawler and HTTP boundary', () => {
  let requests: Request[];
  let directoryUpdated: boolean;
  let eligible: boolean;
  let controller: AbortController;
  let context: TaskExecutionContext;
  beforeEach(() => {
    requests = [];
    directoryUpdated = false;
    eligible = true;
    controller = new AbortController();
    context = {
      signal: controller.signal,
      canUpload: () => eligible,
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
        url.pathname.endsWith('/translate-v2/gpt')
      ) {
        return Response.json({
          titleJp: 'Title',
          introductionJp: '',
          glossaryUuid: 'merged-id',
          glossary: combinedGlossary,
          toc: directoryUpdated ? refreshedToc : initialToc,
        });
      }
      if (request.method === 'GET') {
        return Response.json({
          titleJp: 'Title',
          authors: [],
          type: '连载中',
          attentions: [],
          keywords: [],
          introductionJp: '',
          toc: initialToc,
        });
      }
      if (
        request.method === 'PUT' &&
        url.pathname === '/api/novel/pixiv/fixture'
      ) {
        directoryUpdated = true;
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('/chapter-task/1')) {
        return Response.json({
          paragraphJp: ['source from server task'],
          glossary: combinedGlossary,
          glossaryId: 'merged-id',
          oldGlossary: {},
        });
      }
      if (url.pathname.endsWith('/translate-v2/gpt/chapter/1'))
        return Response.json({ jp: 1, zh: 1 });
      return new Response(null, { status: 204 });
    });
  });

  it('keeps browser crawling out of previews, refreshes chapters on execution and takes the merged glossary from the site API', async () => {
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
    await task.initMeta();
    await task.fetchChapter('1');
    expect(boundary.metadata).not.toHaveBeenCalled();
    expect(boundary.chapter).not.toHaveBeenCalled();
    await task.prepareExecution(context);
    expect(task.needsPreparation).toBe(false);
    expect(task.chapters.map((chapter) => chapter.chapterId)).toEqual([
      '1',
      '2',
    ]);
    expect(task.glossary).toEqual(combinedGlossary);
    const detail = await task.fetchChapter('1', context);
    expect(detail.paragraphs).toEqual(['source from server task']);
    expect(detail.glossary).toEqual(combinedGlossary);
    const chapterTasks = requests.filter((request) =>
      request.url.includes('/chapter-task/'),
    );
    expect(
      chapterTasks.map((request) =>
        new URL(request.url).searchParams.get('sync'),
      ),
    ).toEqual(['true', 'false']);
    expect(
      requests.some(
        (request) =>
          request.method === 'PUT' && request.url.endsWith('/chapter/1'),
      ),
    ).toBe(true);
    await task.uploadChapter('1', detail.glossaryId, ['translated'], context);
    const upload = requests.find((request) =>
      request.url.endsWith('/translate-v2/gpt/chapter/1'),
    )!;
    expect(await upload.json()).toMatchObject({
      glossaryId: 'merged-id',
      paragraphsZh: ['translated'],
    });
    expect(upload.signal.aborted).toBe(false);
    controller.abort();
    expect(upload.signal.aborted).toBe(true);
  });

  it.each(['stopped', 'replaced'] as const)(
    'does not mutate a novel when crawler metadata returns after its job is %s',
    async (reason) => {
      const metadata = deferred<typeof sourceMetadata>();
      boundary.metadata.mockReturnValue(metadata.promise);
      const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
      await task.initMeta();
      const operation = task.prepareExecution(context);
      await vi.waitFor(() => expect(boundary.metadata).toHaveBeenCalledOnce());
      if (reason === 'stopped') controller.abort();
      else eligible = false;
      metadata.resolve(sourceMetadata);
      await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
      expect(task.needsPreparation).toBe(true);
    },
  );

  it('does not create a chapter or request a translation task after a late crawler chapter returns to a stopped run', async () => {
    const chapter = deferred<{ paragraphs: string[] }>();
    boundary.chapter.mockReturnValue(chapter.promise);
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
    await task.initMeta();
    const operation = task.fetchChapter('1', context);
    await vi.waitFor(() => expect(boundary.chapter).toHaveBeenCalledOnce());
    controller.abort();
    chapter.resolve({ paragraphs: ['late source'] });
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('does not fall back from a missing chapter update to creation after permission is revoked', async () => {
    const fallback = boundary.fetch.getMockImplementation()!;
    boundary.fetch.mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'PUT' && request.url.endsWith('/chapter/1')) {
        requests.push(request);
        eligible = false;
        return new Response('章节不存在', { status: 404 });
      }
      return fallback(input, init);
    });
    const task = new WebTranslationTask('pixiv', 'fixture', 'gpt', params);
    await task.initMeta();
    await expect(task.fetchChapter('1', context)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PUT']);
  });
});
