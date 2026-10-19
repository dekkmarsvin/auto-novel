import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenericNovelId } from '../src/model/Common';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/webKit', async () => {
  const { default: ky } = await import('ky');
  return {
    isLocalAuth: false,
    webKit: {
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
          retry: { limit: 2, delay: () => 0 },
        }),
    },
  };
});
vi.mock('../src/stores', () => ({ useLocalVolumeStore: vi.fn() }));

import { useReaderStore } from '../src/pages/reader/ReaderStore';

let pinia: ReturnType<typeof createPinia>;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  disposePinia(pinia);
  vi.resetAllMocks();
});

const chapter = { titleJp: '章', paragraphs: ['本文'] };
const sourceFailure = () => new Response('从源站获取失败', { status: 500 });

describe('reader addon recovery', () => {
  it('does not retry a blocked provider, gives recovery guidance, and can reload after repair', async () => {
    transport.fetch.mockResolvedValueOnce(sourceFailure());
    const reader = useReaderStore(GenericNovelId.web('pixiv', '1'));
    const failed = await reader.loadChapter('2').promiseOrValue;
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    expect(failed).toMatchObject({ ok: false });
    if (failed.ok) throw new Error('Expected the real HTTP failure');
    expect(failed.error.message).toContain('从源站获取失败');
    expect(failed.error.message).toContain('最新版爬虫插件');

    transport.fetch.mockResolvedValueOnce(Response.json(chapter));
    const recovered = await reader.loadChapter('2').promiseOrValue;
    expect(recovered).toEqual({
      ok: true,
      value: { ...chapter, chapterId: '2' },
    });
    expect(reader.loadChapter('2').type).toBe('sync');
    expect(transport.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the API retry policy for ordinary providers', async () => {
    transport.fetch
      .mockResolvedValueOnce(sourceFailure())
      .mockResolvedValueOnce(Response.json(chapter));
    const reader = useReaderStore(GenericNovelId.web('syosetu', 'n1'));
    expect(await reader.loadChapter('2').promiseOrValue).toMatchObject({
      ok: true,
      value: { chapterId: '2' },
    });
    expect(transport.fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves authorization errors without suggesting addon repair', async () => {
    transport.fetch.mockResolvedValueOnce(
      new Response('请登录', { status: 401 }),
    );
    const reader = useReaderStore(GenericNovelId.web('pixiv', '1'));
    expect(await reader.loadChapter('2').promiseOrValue).toEqual({
      ok: false,
      error: { message: '[401]请登录' },
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });
});
