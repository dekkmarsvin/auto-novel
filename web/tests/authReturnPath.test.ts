import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { authReturnPath } from '../src/authReturnPath';

describe('legacy auth route compatibility', () => {
  it('preserves a valid local return path through actual router redirection', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/auth', redirect: (to) => authReturnPath(to.query.from) },
        { path: '/novel/:providerId/:novelId', component: {} },
        { path: '/', component: {} },
      ],
    });
    await router.push(
      '/auth?from=' + encodeURIComponent('/novel/syosetu/n1?tab=glossary'),
    );
    expect(router.currentRoute.value.fullPath).toBe(
      '/novel/syosetu/n1?tab=glossary',
    );
  });
  it.each([
    'https://outside.test',
    '//outside.test',
    '/\\outside.test',
    '/auth?from=/auth',
    undefined,
  ])('rejects unsafe or recursive target %s', (target) => {
    expect(authReturnPath(target)).toBe('/');
  });
});
