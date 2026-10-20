import { PiniaColada, useQueryCache } from '@pinia/colada';
import { createPinia, disposePinia } from 'pinia';
import { createApp, effectScope, nextTick } from 'vue';
import type { WhoamiUser } from '@novelia/web-kit';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({
  listeners: new Set<(user?: WhoamiUser) => void>(),
}));
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/external', () => ({ WebNovelCrawlerApi: {} }));
vi.mock('../src/webKit', async () => {
  const { computed, shallowRef } = await import('vue');
  const { default: ky } = await import('ky');
  const { mockWhoami } = await import('./mockWhoami');
  const user = shallowRef<WhoamiUser>();
  account.listeners.add((value) => {
    user.value = value;
  });
  return {
    isLocalAuth: false,
    webKit: {
      whoami: computed(() => mockWhoami(user.value)),
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
          hooks: {
            beforeRequest: [
              ({ request }) => {
                if (user.value)
                  request.headers.set(
                    'Authorization',
                    `Bearer test-${user.value.id}`,
                  );
              },
            ],
          },
        }),
    },
  };
});

// The real repository cache is created eagerly from the active Pinia. Give it
// the same app lifetime as production, and finish cold imports in collection
// before any case installs its mutable HTTP fixture.
const pinia = createPinia();
const app = createApp({});
app.use(pinia);
app.use(PiniaColada, {
  queryOptions: { refetchOnWindowFocus: false, refetchOnReconnect: false },
});
const { WebNovelRepo } = await import('../src/repos/useWebNovel');
const { WenkuNovelRepo } = await import('../src/repos/useWenkuNovel');
afterAll(() => disposePinia(pinia));

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function signIn(id?: number) {
  for (const listener of account.listeners)
    listener(
      id === undefined
        ? undefined
        : {
            id,
            username: `user-${id}`,
            role: 'member',
            createdAt: 0,
            adminMode: false,
          },
    );
}
async function setup(kind: 'web' | 'wenku') {
  const requests: { request: Request; resolve: (value: Response) => void }[] =
    [];
  transport.fetch.mockReset().mockImplementation(
    (request: Request) =>
      new Promise<Response>((resolve, reject) => {
        requests.push({ request, resolve });
        request.signal.addEventListener(
          'abort',
          () => reject(request.signal.reason),
          { once: true },
        );
      }),
  );
  const scope = effectScope();
  const cache = app.runWithContext(() => useQueryCache());
  expect(cache.getEntries()).toHaveLength(0);
  // Register disposal before creating the query, including an assertion/setup
  // failure. Let real HTTP cancellation and Colada's error handlers settle while
  // their Pinia is still alive, then release its state.
  cleanups.push(async () => {
    const pending = cache
      .getEntries()
      .flatMap((entry) => (entry.pending ? [entry.pending.refreshCall] : []));
    signIn();
    cache.cancelQueries();
    scope.stop();
    await Promise.allSettled(pending);
    await nextTick();
    for (const entry of cache.getEntries()) cache.remove(entry);
  });
  signIn(1);
  const query = app.runWithContext(() =>
    scope.run(() =>
      kind === 'web'
        ? WebNovelRepo.useWebNovelFavoredList(1, 'default', { sort: 'create' })
        : WenkuNovelRepo.useWenkuNovelFavoredList(1, 'default', {
            sort: 'create',
          }),
    ),
  )!;
  return { requests, query, cache };
}
const page = (owner: string) =>
  Response.json({ total: 1, items: [{ id: owner }] });

describe('private favorite pages across account changes', () => {
  for (const kind of ['web', 'wenku'] as const) {
    it(`${kind}: switches viewers without previous placeholder data and disables guests`, async () => {
      const { requests, query, cache } = await setup(kind);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0].request.headers.get('Authorization')).toBe(
        'Bearer test-1',
      );
      requests[0].resolve(page('alice'));
      await vi.waitFor(() =>
        expect(query.data.value?.items[0].id).toBe('alice'),
      );
      signIn(2);
      await nextTick();
      expect(query.data.value).toBeUndefined();
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1].request.headers.get('Authorization')).toBe(
        'Bearer test-2',
      );
      requests[1].resolve(page('bob'));
      await vi.waitFor(() => expect(query.data.value?.items[0].id).toBe('bob'));
      expect(
        cache.getEntries({ key: [`${kind}-novel-list-favored`, 1] }),
      ).toHaveLength(0);
      signIn();
      await nextTick();
      await nextTick();
      expect(query.data.value).toBeUndefined();
      expect(requests).toHaveLength(2);
    });
    it(`${kind}: cancels real HTTP signals on viewer change and logout, ignoring late results`, async () => {
      const { requests, query } = await setup(kind);
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      signIn(2);
      await nextTick();
      expect(requests[0].request.signal.aborted).toBe(true);
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      signIn();
      await nextTick();
      expect(requests[1].request.signal.aborted).toBe(true);
      requests[0].resolve(page('stale-alice'));
      requests[1].resolve(page('stale-bob'));
      await nextTick();
      await nextTick();
      expect(query.data.value).toBeUndefined();
      expect(requests).toHaveLength(2);
    });
  }
});
