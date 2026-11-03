import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationPipeline, type Translator } from '@auto-novel/translator';
import type {
  TranslateTaskParams,
  WebTranslateTask,
} from '../src/model/Translator';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/api/client', async () => {
  const { default: ky } = await import('ky');
  return {
    client: ky.create({
      prefix: 'https://books.test/api/',
      retry: 0,
      fetch: transport.fetch,
    }),
  };
});
vi.mock('../src/api', async () => ({
  WebNovelApi: (await import('../src/api/WebNovelApi')).WebNovelApi,
}));
vi.mock('../src/domain/crawler', () => ({
  CrawlerService: { updateWebNovel: vi.fn(), updateWebNovelChapter: vi.fn() },
}));

import { WorkPreparer } from '../src/domain/translator/prepare-work';
import { TaskLifecycle } from '../src/domain/translator/task-lifecycle';
import {
  TaskState,
  type UnitStatus,
} from '../src/domain/translator/task-state';
import { WebTranslationTask } from '../src/domain/translator/tasks/web-task';

const params: TranslateTaskParams = {
  level: 'normal',
  forceMetadata: false,
  useBrowserCrawler: false,
  startIndex: 0,
  endIndex: 65535,
};
const fixture = (): WebTranslateTask => ({
  titleJp: 'ウマ娘の物語',
  introductionJp: '最初の行\n\n最後の行',
  glossaryUuid: 'glossary-1',
  glossary: { ウマ娘: '賽馬娘' },
  toc: [
    { chapterId: '1', titleJp: '第１話　出会い' },
    { chapterId: '2', titleJp: '第２話　出会い' },
    { titleJp: '閑話' },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('Sakura web metadata HTTP boundary', () => {
  let source: WebTranslateTask;
  let posts: { request: Request; body: unknown }[];
  const pipelines: TranslationPipeline[] = [];
  beforeEach(() => {
    source = fixture();
    posts = [];
    transport.fetch.mockReset().mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (request.method === 'GET') return Response.json(source);
      posts.push({ request, body: await request.json() });
      return new Response('ok');
    });
  });
  afterEach(() =>
    pipelines.splice(0).forEach((pipeline) => pipeline.dispose()),
  );

  async function task(
    forceMetadata = false,
    translatorId: 'sakura' | 'gpt' = 'sakura',
  ) {
    const task = new WebTranslationTask('syosetu', 'n1', translatorId, {
      ...params,
      forceMetadata,
    });
    await task.initialize({
      signal: new AbortController().signal,
      onLog: vi.fn(),
    });
    return task;
  }
  async function metadataWork(
    current: WebTranslationTask,
    signal: AbortSignal,
  ) {
    const state = new TaskState();
    state.initialize(current.chapters, current.metadataUnit);
    const tracker = {
      onUnitStatus: (id: string, status: UnitStatus) =>
        state.updateStatus(id, status),
      onLog: vi.fn(),
    };
    const work = await new WorkPreparer(current).prepareUnit(
      state.metadataUnit!,
      tracker,
      signal,
    );
    return { work, state, tracker };
  }
  function pipeline(translator: Translator) {
    const pipeline = new TranslationPipeline();
    pipelines.push(pipeline);
    pipeline.registerTranslator(translator);
    return pipeline;
  }

  it('translates physical metadata lines once, restores multiline fields and deduplicated TOC, and binds the active run signal', async () => {
    const current = await task();
    const run = new AbortController();
    const { work, state } = await metadataWork(current, run.signal);
    expect(work?.lines).toEqual([
      'ウマ娘の物語',
      '最初の行',
      '最後の行',
      '出会い',
    ]);
    expect(work?.glossary).toEqual(source.glossary);
    const translate = vi.fn<Translator['translate']>(
      async ({ lines, context }) => {
        expect(lines).toEqual(work!.lines);
        expect(context?.glossary).toEqual(source.glossary);
        return ['賽馬娘的故事', '第一行', '最後一行', '相遇'];
      },
    );
    const running = pipeline({ trusted: true, translate });
    await running.submit(work!, run.signal);
    await running.drain();
    expect(translate).toHaveBeenCalledOnce();
    expect(posts).toHaveLength(1);
    expect(posts[0].request.url).toBe(
      'https://books.test/api/novel/syosetu/n1/translate-v2/sakura/metadata',
    );
    expect(posts[0].body).toEqual({
      title: '賽馬娘的故事',
      introduction: '第一行\n\n最後一行',
      toc: {
        '第１話　出会い': '第１话　相遇',
        '第２話　出会い': '第２话　相遇',
        閑話: '闲话',
      },
    });
    expect(state.metadataUnit?.status).toBe('done');
    expect(state.progress.finished).toBe(0);
    run.abort();
    expect(posts[0].request.signal.aborted).toBe(true);
  });

  it('saves deterministic forced TOC without producing model work or replacing an existing title and introduction', async () => {
    source.titleZh = '既有標題';
    source.introductionZh = '既有簡介';
    source.toc = [
      {
        chapterId: '1',
        titleJp: '第1話',
        titleZh: '舊目錄',
        glossaryUuid: 'glossary-1',
      },
      { titleJp: '幕間', titleZh: '舊分組' },
    ];
    const current = await task(true);
    expect(current.chapters).toEqual([]);
    expect(current.metadataUnit).toBeDefined();
    const { work, state } = await metadataWork(
      current,
      new AbortController().signal,
    );
    expect(work).toBeUndefined();
    expect(state.metadataUnit?.status).toBe('done');
    expect(posts.map(({ body }) => body)).toEqual([
      { toc: { 第1話: '第1话', 幕間: '幕间' } },
    ]);
    expect((await task(true, 'gpt')).metadataUnit).toBeUndefined();
  });

  it.each(['stopped', 'replaced', 'permission-revoked'] as const)(
    'does not upload metadata returned after its execution is %s',
    async (reason) => {
      const current = await task();
      const run = new AbortController();
      const permission = new AbortController();
      const lifecycle = new TaskLifecycle(1);
      const signal = lifecycle.signalFor(
        AbortSignal.any([run.signal, permission.signal]),
      );
      const { work, state } = await metadataWork(current, signal);
      const translated = deferred<string[]>();
      const translate = vi.fn<Translator['translate']>(
        async () => translated.promise,
      );
      const running = pipeline({ trusted: true, translate });
      await running.submit(work!, signal);
      await vi.waitFor(() => expect(translate).toHaveBeenCalledOnce());
      if (reason === 'replaced') lifecycle.abort();
      else if (reason === 'permission-revoked') permission.abort();
      else run.abort();
      translated.resolve(['標題', '簡介', '結尾', '相遇']);
      await running.drain();
      // Reject a direct late settlement as well: the save closure is guarded.
      await expect(
        work!.onComplete({
          lines: ['標題', '簡介', '結尾', '相遇'],
          failed: [],
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(state.metadataUnit?.status).toBe('pending');
      expect(posts).toEqual([]);
    },
  );

  it('does not hand remote metadata to an ineligible model before translation', async () => {
    const current = await task();
    const run = new AbortController();
    const { work, state } = await metadataWork(current, run.signal);
    expect(work?.trustedOnly).toBe(true);
    const translate = vi.fn<Translator['translate']>(async () => [
      '標題',
      '簡介',
      '結尾',
      '相遇',
    ]);
    const running = pipeline({ trusted: false, translate });
    await running.submit(work!, run.signal);
    await Promise.resolve();
    expect(translate).not.toHaveBeenCalled();
    run.abort();
    await running.drain();
    expect(state.metadataUnit?.status).toBe('pending');
    expect(posts).toEqual([]);
  });

  it('rejects incomplete metadata rather than uploading a misplaced result', async () => {
    const current = await task();
    const { work } = await metadataWork(current, new AbortController().signal);
    await expect(
      work!.onComplete({ lines: ['標題'], failed: [] }),
    ).rejects.toThrow('数量不匹配');
    expect(posts).toEqual([]);
  });

  it('keeps partial model failures retryable without uploading original-text fallbacks', async () => {
    const current = await task();
    const { work, state, tracker } = await metadataWork(
      current,
      new AbortController().signal,
    );
    const running = new TranslationPipeline({
      segmenter: {
        segment: () => [
          { start: 0, end: 2 },
          { start: 2, end: 4 },
        ],
      },
    });
    pipelines.push(running);
    const translate = vi.fn<Translator['translate']>(async ({ lines }) => {
      if (lines[0] === 'ウマ娘の物語') return ['已成功的標題', '已成功的簡介'];
      throw new Error('provider rejected second segment');
    });
    running.registerTranslator({
      trusted: true,
      translate,
    });
    await running.submit(work!);
    await running.drain();
    expect(translate).toHaveBeenCalledTimes(2);
    expect(tracker.onLog).toHaveBeenCalledWith(
      expect.stringContaining('1 个分段翻译失败'),
    );
    expect(state.metadataUnit?.status).toBe('error');
    expect(posts).toEqual([]);
    expect(state.resetFailedUnits()).toBe(true);
    expect(state.metadataUnit?.status).toBe('pending');
  });
});
