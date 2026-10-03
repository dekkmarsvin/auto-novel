import { PiniaColada } from '@pinia/colada';
import type { AuthUser } from '@novelia/auth-api';
import { createPinia, disposePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  listeners: new Set<(user?: AuthUser) => void>(),
}));
const listFavored = vi.hoisted(() => vi.fn());

vi.mock('../src/api/auth/session', () => ({
  authApi: {
    watchUser(listener: (user?: AuthUser) => void) {
      session.listeners.add(listener);
      listener(undefined);
      return () => session.listeners.delete(listener);
    },
  },
}));
vi.mock('../src/api', () => ({ FavoredApi: { listFavored } }));

import { useFavoredStore } from '../src/stores/useFavored';

type FolderList = {
  favoredWeb: { id: string; title: string }[];
  favoredWenku: { id: string; title: string }[];
};

const folders = (account: string): FolderList => ({
  favoredWeb: [{ id: `${account}-web`, title: `${account} Web` }],
  favoredWenku: [{ id: `${account}-wenku`, title: `${account} Wenku` }],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function signIn(id?: number) {
  const user: AuthUser | undefined =
    id === undefined
      ? undefined
      : {
          id,
          username: `user-${id}`,
          role: 'member',
          createdAt: 0,
          adminMode: false,
        };
  for (const listener of session.listeners) listener(user);
}

describe('favorite folders after asynchronous authentication', () => {
  let pinia: ReturnType<typeof createPinia>;
  let store: ReturnType<typeof useFavoredStore>;

  beforeEach(() => {
    const values = new Map<string, string>();
    values.set(
      'favored',
      JSON.stringify({
        web: [{ id: 'default', title: '默认收藏夹' }],
        wenku: [{ id: 'default', title: '默认收藏夹' }],
        local: [{ id: 'local-books', title: 'My local books' }],
      }),
    );
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    listFavored.mockReset();
    session.listeners.clear();
    const app = createApp({});
    pinia = createPinia();
    app.use(pinia);
    app.use(PiniaColada, {
      queryOptions: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    });
    store = app.runWithContext(() => useFavoredStore(pinia));
  });

  afterEach(() => {
    disposePinia(pinia);
    vi.unstubAllGlobals();
  });

  it('loads remote folders when refresh completes after the store starts', async () => {
    listFavored.mockResolvedValue(folders('alice'));
    await nextTick();
    expect(listFavored).not.toHaveBeenCalled();

    signIn(1);

    await vi.waitFor(() => {
      expect(store.favoreds.web).toEqual(folders('alice').favoredWeb);
      expect(store.favoreds.wenku).toEqual(folders('alice').favoredWenku);
    });
    expect(listFavored).toHaveBeenCalledTimes(1);
    expect(store.favoreds.local).toEqual([
      { id: 'local-books', title: 'My local books' },
    ]);
  });

  it('loads the new account and ignores the previous account pending result', async () => {
    const aliceRequest = deferred<FolderList>();
    const bobRequest = deferred<FolderList>();
    listFavored
      .mockReturnValueOnce(aliceRequest.promise)
      .mockReturnValueOnce(bobRequest.promise);

    signIn(1);
    await vi.waitFor(() => expect(listFavored).toHaveBeenCalledTimes(1));
    signIn(2);
    await vi.waitFor(() => expect(listFavored).toHaveBeenCalledTimes(2));
    bobRequest.resolve(folders('bob'));
    await vi.waitFor(() =>
      expect(store.favoreds.web).toEqual(folders('bob').favoredWeb),
    );

    aliceRequest.resolve(folders('alice'));
    await aliceRequest.promise;
    await nextTick();
    expect(store.favoreds.web).toEqual(folders('bob').favoredWeb);
    expect(store.favoreds.wenku).toEqual(folders('bob').favoredWenku);
    expect(store.favoreds.local[0].id).toBe('local-books');
  });

  it('clears the previous account folders while another account is loading', async () => {
    const bobRequest = deferred<FolderList>();
    listFavored
      .mockResolvedValueOnce(folders('alice'))
      .mockReturnValueOnce(bobRequest.promise);
    signIn(1);
    await vi.waitFor(() =>
      expect(store.favoreds.web).toEqual(folders('alice').favoredWeb),
    );

    signIn(2);
    expect(store.favoreds.web).toEqual([
      { id: 'default', title: '默认收藏夹' },
    ]);
    await vi.waitFor(() => expect(listFavored).toHaveBeenCalledTimes(2));
    signIn();
    bobRequest.resolve(folders('bob'));
    await bobRequest.promise;
    await nextTick();

    expect(store.favoreds.web).toEqual([
      { id: 'default', title: '默认收藏夹' },
    ]);
    expect(store.favoreds.wenku).toEqual([
      { id: 'default', title: '默认收藏夹' },
    ]);
    expect(store.favoreds.local[0].id).toBe('local-books');
    expect(listFavored).toHaveBeenCalledTimes(2);
  });
});
