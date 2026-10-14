import ky from 'ky';
import { describe, expect, it } from 'vitest';
import { CrawlerAuthError, CrawlerHttpError } from '../../src/errors';
import { Nailain } from '../../src/web/nailain';

const post = {
  id: 'mock-id',
  title: 'Mock title',
  date: '20260917',
  characters: 123,
  category: 'Mock category',
  tags: ['Mock tag'],
  body: 'first\nsecond',
};

describe('NAILAIN offline login', () => {
  for (const scenario of [
    'success',
    'wrong',
    'missing',
    'still unauthorized',
    'login error',
    'post unavailable',
  ]) {
    it(scenario, async () => {
      const requests: Request[] = [];
      const provider = new Nailain(
        ky.create({
          fetch: async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            expect(url.origin).toBe('https://nailain.alwaysdata.net');
            expect(url.search).toBe('');
            if (request.method === 'POST') {
              expect(url.pathname).toBe('/login');
              expect(await request.clone().text()).toBe(
                'password=mock-password&next=%2F',
              );
              return new Response(null, {
                status:
                  scenario === 'wrong'
                    ? 401
                    : scenario === 'login error'
                      ? 500
                      : 303,
                headers: {
                  'set-cookie': 'na_session=mock-session; Path=/; HttpOnly',
                },
              });
            }
            expect(request.method).toBe('GET');
            expect(url.pathname).toBe('/api/posts/mock-id');
            if (scenario === 'post unavailable')
              return new Response(null, { status: 404 });
            if (
              request.headers.get('cookie') !== 'na_session=mock-session' ||
              scenario === 'still unauthorized'
            )
              return new Response(null, { status: 401 });
            return Response.json(post);
          },
        }),
        { password: scenario === 'missing' ? undefined : 'mock-password' },
      );
      if (scenario === 'success') {
        expect(await provider.getChapter('mock-id', 'default')).toEqual({
          paragraphs: ['first', 'second'],
        });
        await provider.getChapter('mock-id', 'default');
        expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
      } else if (scenario === 'post unavailable') {
        const result = provider.getChapter('mock-id', 'default');
        await expect(result).rejects.toBeInstanceOf(CrawlerHttpError);
        await expect(result).rejects.toMatchObject({
          status: 404,
          url: 'https://nailain.alwaysdata.net/api/posts/mock-id',
        });
      } else
        await expect(
          provider.getChapter('mock-id', 'default'),
        ).rejects.toBeInstanceOf(CrawlerAuthError);
      expect(requests).toHaveLength(
        scenario === 'missing' || scenario === 'post unavailable'
          ? 1
          : scenario === 'success'
            ? 4
            : scenario === 'still unauthorized'
              ? 3
              : 2,
      );
    });
  }
  it('maps source metadata to one R18 short-story chapter', async () => {
    const provider = new Nailain(
      ky.create({
        fetch: async (input, init) => {
          const request = new Request(input, init);
          expect(request.method).toBe('GET');
          expect(request.url).toBe(
            'https://nailain.alwaysdata.net/api/posts/mock-id',
          );
          return Response.json(post);
        },
      }),
    );
    expect(await provider.getMetadata('mock-id')).toEqual({
      title: 'Mock title',
      authors: [{ name: 'NAILAIN', link: 'https://nailain.fanbox.cc/' }],
      type: '短篇',
      attentions: ['R18'],
      keywords: ['Mock category', 'Mock tag'],
      points: null,
      totalCharacters: 123,
      introduction: 'first\nsecond',
      toc: [
        {
          title: 'Mock title',
          chapterId: 'default',
          createAt: '2026-09-16T15:00:00.000Z',
        },
      ],
    });
  });
});
