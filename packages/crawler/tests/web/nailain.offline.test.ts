import ky from 'ky';
import { describe, expect, it } from 'vitest';
import { Nailain } from '../../src/web/nailain';

describe('NAILAIN offline login', () => {
  for (const scenario of [
    'success',
    'wrong',
    'missing',
    'still unauthorized',
    'login error',
  ]) {
    it(scenario, async () => {
      const requests: Request[] = [];
      const provider = new Nailain(
        ky.create({
          fetch: async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            if (request.method === 'POST') {
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
            if (
              request.headers.get('cookie') !== 'na_session=mock-session' ||
              scenario === 'still unauthorized'
            )
              return new Response(null, { status: 401 });
            return Response.json({ body: 'first\nsecond' });
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
      } else
        await expect(
          provider.getChapter('mock-id', 'default'),
        ).rejects.toThrow();
      expect(requests).toHaveLength(
        scenario === 'missing'
          ? 1
          : scenario === 'success'
            ? 4
            : scenario === 'still unauthorized'
              ? 3
              : 2,
      );
    });
  }
});
