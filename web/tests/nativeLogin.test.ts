import { createApp } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebKit } from '../node_modules/@novelia/web-kit/src/create';
import { useWebKitInternals } from '../node_modules/@novelia/web-kit/src/context';
import { isCurrentAuthor } from '../src/identity';

const now = 2_000_000_000_000;
const jwt = (username: string, uid: number, role = 'member') =>
  `h.${Buffer.from(JSON.stringify({ uid, sub: username, role, crat: 0, iat: now / 1000, exp: now / 1000 + 3600 })).toString('base64url')}.s`;
let storage: Storage;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const values = new Map<string, string>([
    [
      'web-kit:session:v1',
      JSON.stringify({ token: jwt('reader', 7), adminMode: false }),
    ],
  ]);
  storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
  const browser = new EventTarget();
  Object.assign(browser, {
    localStorage: storage,
    location: new URL('https://books.kotoban.test/novel/syosetu/n1'),
  });
  vi.stubGlobal('window', browser);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pinned native login and Kotoban API compatibility', () => {
  it('posts native credentials, preserves rejected sessions, and shares login/refresh/logout with the novel client', async () => {
    const requests: Request[] = [];
    const loginBodies: unknown[] = [];
    let loginStatus = 401;
    let loginResult = 'invalid credentials';
    const adminToken = jwt('admin', 8, 'admin');
    const refreshToken = jwt('admin-refreshed', 8, 'admin');
    const fetch = vi.fn(async (request: Request) => {
      requests.push(request);
      const url = new URL(request.url);
      if (url.origin === 'https://auth.kotoban.test') {
        if (url.pathname === '/api/v1/me/attention-status') {
          return Response.json({ strikes: { hasUnread: false } });
        }
        expect(request.credentials).toBe('include');
        expect(request.headers.has('Authorization')).toBe(false);
        expect(request.method).toBe('POST');
        if (url.pathname === '/api/v1/auth/login') {
          loginBodies.push(await request.json());
          return new Response(loginResult, { status: loginStatus });
        }
        if (url.pathname === '/api/v1/auth/refresh') {
          expect(url.searchParams.get('app')).toBe('n');
          return new Response(refreshToken);
        }
        if (url.pathname === '/api/v1/auth/logout') {
          return new Response('');
        }
      }
      if (url.origin === 'https://books.kotoban.test') {
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected fixture request: ${request.url}`);
    });
    vi.stubGlobal('fetch', fetch);
    const kit = createWebKit({
      auth: { app: 'n', url: 'https://auth.kotoban.test/' },
      brand: '小说',
    });
    const app = createApp({});
    kit.install(app);
    const { session } = app.runWithContext(useWebKitInternals);
    const novel = kit.createClient('https://books.kotoban.test/api/');
    const lastNovelRequest = () =>
      requests
        .filter(
          (request) => request.url === 'https://books.kotoban.test/api/novel',
        )
        .at(-1)!;
    const credentials = { username: 'admin', password: 'fixture-password' };

    await expect(
      session.login(credentials.username, credentials.password),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(kit.whoami.value.user?.username).toBe('reader');
    expect(isCurrentAuthor(kit.whoami.value, 'reader')).toBe(true);

    loginStatus = 200;
    for (const result of ['', 'invalid-token']) {
      loginResult = result;
      await expect(
        session.login(credentials.username, credentials.password),
      ).rejects.toThrow();
      expect(kit.whoami.value.user?.username).toBe('reader');
      expect(JSON.parse(storage.getItem('web-kit:session:v1')!).token).toBe(
        jwt('reader', 7),
      );
    }

    loginResult = adminToken;
    await session.login(credentials.username, credentials.password);
    expect(loginBodies).toEqual(
      Array.from({ length: 4 }, () => ({ ...credentials, app: 'n' })),
    );
    expect(kit.whoami.value.user?.id).toBe(8);
    expect(kit.whoami.value.isAdmin).toBe(true);
    expect(kit.whoami.value.asAdmin).toBe(false);
    expect(isCurrentAuthor(kit.whoami.value, 'reader')).toBe(false);
    expect(isCurrentAuthor(kit.whoami.value, 'admin')).toBe(true);
    expect(
      requests.some((request) => request.url.includes('/auth/refresh')),
    ).toBe(false);
    await novel.get('novel');
    expect(lastNovelRequest().headers.get('Authorization')).toBe(
      `Bearer ${adminToken}`,
    );

    expect(session.toggleAdminMode()).toBe(true);
    await session.accessToken.refresh();
    expect(kit.whoami.value.user?.username).toBe('admin-refreshed');
    expect(kit.whoami.value.asAdmin).toBe(true);
    await novel.get('novel');
    expect(lastNovelRequest().headers.get('Authorization')).toBe(
      `Bearer ${refreshToken}`,
    );

    await kit.logout();
    expect(kit.whoami.value.isSignedIn).toBe(false);
    expect(kit.whoami.value.asAdmin).toBe(false);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
    await novel.get('novel');
    expect(lastNovelRequest().headers.has('Authorization')).toBe(false);
    expect(
      requests.filter((request) => request.url.includes('/auth/logout')),
    ).toHaveLength(1);
  });
});
