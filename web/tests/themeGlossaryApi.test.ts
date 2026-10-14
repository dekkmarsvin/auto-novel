import { describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/api/novel/client', async () => {
  const { default: ky } = await import('ky');
  return {
    client: ky.create({
      prefix: 'https://books.test/api/',
      fetch: transport.fetch,
      retry: 0,
    }),
  };
});

import { ThemeGlossaryApi } from '../src/api/novel/ThemeGlossaryApi';
import { Glossary } from '../src/model/Glossary';

describe('theme glossary API response contracts', () => {
  it.each([200, 204])(
    'saves imported terms with an empty %i response',
    async (status) => {
      const glossary = Glossary.fromText(
        "アーモンドアイ => 杏目\r\nReach for the stars プロジェクトL'Arc => 追逐群星：凱旋門計畫",
      )!;
      expect(glossary).toEqual({
        アーモンドアイ: '杏目',
        "Reach for the stars プロジェクトL'Arc": '追逐群星：凱旋門計畫',
      });
      transport.fetch.mockImplementation(async (request: Request) => {
        expect(request.method).toBe('PUT');
        expect(request.url).toBe('https://books.test/api/theme-glossary/theme');
        expect(await request.json()).toEqual({ name: '賽馬娘', glossary });
        return new Response(null, { status });
      });

      await expect(
        ThemeGlossaryApi.update('theme', '賽馬娘', glossary),
      ).resolves.toBeUndefined();
    },
  );

  it.each([200, 204])('deletes with an empty %i response', async (status) => {
    transport.fetch.mockImplementation(async (request: Request) => {
      expect(request.method).toBe('DELETE');
      expect(request.url).toBe('https://books.test/api/theme-glossary/theme');
      return new Response(null, { status });
    });

    await expect(
      ThemeGlossaryApi.deleteGlossary('theme'),
    ).resolves.toBeUndefined();
  });

  it.each([401, 403, 404, 500])(
    'preserves HTTP %i failures',
    async (status) => {
      transport.fetch.mockImplementation(
        async () => new Response(null, { status }),
      );

      await expect(
        ThemeGlossaryApi.update('theme', '賽馬娘', {}),
      ).rejects.toMatchObject({
        response: { status },
      });
      await expect(
        ThemeGlossaryApi.deleteGlossary('theme'),
      ).rejects.toMatchObject({
        response: { status },
      });
    },
  );

  it('still parses list JSON and the created ID as text', async () => {
    transport.fetch.mockImplementation(async (request: Request) => {
      if (request.method === 'GET') return Response.json([]);
      expect(request.method).toBe('POST');
      expect(await request.json()).toEqual({ name: '賽馬娘', glossary: {} });
      return new Response('created-id');
    });

    await expect(ThemeGlossaryApi.list()).resolves.toEqual([]);
    await expect(ThemeGlossaryApi.create('賽馬娘', {})).resolves.toBe(
      'created-id',
    );
  });
});
