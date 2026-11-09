import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import ky from 'ky';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CrawlerAuthError, CrawlerParseError } from '@/errors';
import { Pixiv } from '@/web/pixiv';
import { WebNovelType } from '@/web/types';

describe('Pixiv series pagination', () => {
  let origin: string;
  let pageStarts: number[];
  let mode:
    | 'complete'
    | 'missing'
    | 'short'
    | 'duplicate'
    | 'malformed'
    | 'http-error'
    | 'hidden';
  let total: number | undefined;
  let isConcluded: boolean | undefined;
  const createDate = '2026-10-19T09:00:00+09:00';
  const uploadTimestamp = 1792454400;
  const chapters = Array.from({ length: 61 }, (_, index) => ({
    id: String(index + 1),
    title: `Chapter ${index + 1}`,
    series: { viewableType: 0 },
    tags: ['series-tag'],
    ...(index === 0
      ? { createDate, uploadTimestamp: 1 }
      : index === 1
        ? { uploadTimestamp }
        : {}),
  }));
  const server = createServer((request, response) => {
    const url = new URL(request.url!, origin);
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/settings/viewing') {
      response.end('<input name="r18" checked>');
    } else if (url.pathname === '/ajax/novel/series/fixture') {
      response.end(
        JSON.stringify({
          body: { title: 'Series', total, tags: [], isConcluded },
        }),
      );
    } else if (url.pathname === '/ajax/novel/123') {
      response.end(
        JSON.stringify({
          body: {
            title: 'Single',
            userName: 'Author',
            userId: '7',
            seriesNavData: null,
            tags: { tags: [] },
            xRestrict: 0,
            characterCount: 10,
            description: 'Intro',
            createDate,
          },
        }),
      );
    } else if (url.pathname === '/ajax/novel/series_content/fixture') {
      const start = Number(url.searchParams.get('last_order'));
      pageStarts.push(start);
      if (start === 30 && mode === 'http-error') {
        response.statusCode = 500;
        response.end('{}');
        return;
      }
      if (start === 30 && mode === 'missing') {
        response.end(JSON.stringify({ body: { page: {} } }));
        return;
      }
      const contents = chapters.slice(start, start + 30);
      if (start === 30 && mode === 'malformed') {
        response.end(
          JSON.stringify({
            body: {
              page: {
                seriesContents: [
                  { ...contents[0], id: undefined },
                  ...contents.slice(1),
                ],
              },
            },
          }),
        );
        return;
      }
      if (start === 30 && mode === 'short') contents.pop();
      if (start === 30 && mode === 'duplicate') contents[0] = chapters[0];
      if (start === 30 && mode === 'hidden') {
        contents[0] = { ...contents[0], series: { viewableType: 1 } };
      }
      response.end(
        JSON.stringify({ body: { page: { seriesContents: contents } } }),
      );
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });

  beforeAll(async () => {
    // Viewing-settings DOM parsing is outside this pagination regression.
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString() {
          return { querySelector: () => ({ checked: true }) };
        }
      },
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  const provider = (
    nextMode: typeof mode = 'complete',
    nextTotal: number | undefined = 61,
  ) => {
    mode = nextMode;
    total = nextTotal;
    isConcluded = undefined;
    pageStarts = [];
    return new Pixiv(
      ky.create({
        retry: 0,
        fetch(input, init) {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
          );
          return fetch(new URL(url.pathname + url.search, origin), init);
        },
      }),
    );
  };

  it('collects all 61 chapters through pages 0/30/60 with order, tags and timestamps intact', async () => {
    const metadata = await provider().getMetadata('fixture');
    expect(pageStarts).toEqual([0, 30, 60]);
    expect(metadata.toc.map((chapter) => chapter.chapterId)).toEqual(
      chapters.map((chapter) => chapter.id),
    );
    expect(metadata.toc.slice(0, 3).map((chapter) => chapter.createAt)).toEqual(
      ['2026-10-19T00:00:00.000Z', '2026-10-20T00:00:00.000Z', null],
    );
    expect(metadata.keywords).toEqual(['series-tag']);
  });

  it.each([
    [true, WebNovelType.Completed],
    [false, WebNovelType.Ongoing],
    [undefined, WebNovelType.Ongoing],
  ] as const)(
    'maps series completion %s without losing paginated chapters',
    async (concluded, expected) => {
      const crawler = provider();
      isConcluded = concluded;
      const metadata = await crawler.getMetadata('fixture');
      expect(metadata.type).toBe(expected);
      expect(pageStarts).toEqual([0, 30, 60]);
      expect(metadata.toc.map((chapter) => chapter.chapterId)).toEqual(
        chapters.map((chapter) => chapter.id),
      );
    },
  );

  it('normalizes a standalone chapter offset timestamp to the server-compatible ISO format', async () => {
    const metadata = await provider().getMetadata('s123');
    expect(metadata.type).toBe(WebNovelType.ShortStory);
    expect(metadata.toc).toEqual([
      { title: '无名', chapterId: '123', createAt: '2026-10-19T00:00:00.000Z' },
    ]);
    expect(pageStarts).toEqual([]);
  });

  it.each([
    'missing',
    'short',
    'duplicate',
    'malformed',
    'http-error',
  ] as const)(
    'rejects a %s second page instead of returning a partial or repeated directory',
    async (failure) => {
      const result = provider(failure).getMetadata('fixture');
      if (failure === 'http-error') {
        await expect(result).rejects.toMatchObject({
          response: { status: 500 },
        });
      } else {
        await expect(result).rejects.toBeInstanceOf(CrawlerParseError);
      }
      expect(pageStarts).toEqual([0, 30]);
    },
  );

  it('keeps rejecting hidden chapters rather than replacing them with placeholders', async () => {
    await expect(
      provider('hidden').getMetadata('fixture'),
    ).rejects.toBeInstanceOf(CrawlerAuthError);
    expect(pageStarts).toEqual([0, 30]);
  });

  it('rejects missing total metadata before requesting or accepting an empty directory', async () => {
    const crawler = provider();
    total = undefined;
    await expect(crawler.getMetadata('fixture')).rejects.toBeInstanceOf(
      CrawlerParseError,
    );
    expect(pageStarts).toEqual([]);
  });
});
