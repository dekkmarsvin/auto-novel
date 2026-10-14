import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Exercise the immutable SDK's real wire/storage bridge without mounting its UI.
import { createAuthSession } from '../node_modules/@novelia/web-kit/src/auth/session';
import { createLoginBridge } from '../node_modules/@novelia/web-kit/src/auth/login';
import { migrateLegacyStorage } from '../src/storageMigration.js';
import { isCurrentAuthor } from '../src/identity';

const now = 2_000_000_000_000;
const jwt = (username = 'reader') =>
  `h.${Buffer.from(JSON.stringify({ uid: 7, sub: username, role: 'member', crat: 0, iat: now / 1000, exp: now / 1000 + 3600 })).toString('base64url')}.s`;
let storage: Storage;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const values = new Map<string, string>();
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
  Object.assign(browser, { localStorage: storage });
  vi.stubGlobal('window', browser);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pinned web-kit session and login compatibility', () => {
  it('loads the migrated session with the real SDK and preserves glossary ownership', async () => {
    storage.setItem('auth-v2', JSON.stringify({ token: jwt() }));
    migrateLegacyStorage(storage, now);
    const requestRefresh = vi.fn();
    const session = createAuthSession({
      app: 'n',
      requestRefresh,
      requestLogout: vi.fn(),
    });
    expect(await session.checkSignedIn()).toBe(true);
    expect(session.whoami.value.user?.id).toBe(7);
    expect(isCurrentAuthor(session.whoami.value, 'reader')).toBe(true);
    expect(isCurrentAuthor(session.whoami.value, 'other')).toBe(false);
    expect(requestRefresh).not.toHaveBeenCalled();
    await session.logout();
    expect(session.whoami.value.isSignedIn).toBe(false);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
    storage.setItem('auth-v2', JSON.stringify({ token: jwt() }));
    migrateLegacyStorage(storage, now);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
  });
  it('uses the existing login_success/source/origin protocol and refreshes the Cookie session', async () => {
    const session = createAuthSession({
      app: 'n',
      requestRefresh: vi.fn().mockResolvedValue(jwt()),
      requestLogout: vi.fn(),
    });
    await session.checkSignedIn();
    const refresh = vi.fn(() => session.accessToken.refresh());
    const bridge = createLoginBridge(
      new URL('https://auth.kotoban.top/'),
      'n',
      refresh,
    );
    const frame = {} as Window;
    const event = {
      data: { type: 'login_success' },
      origin: 'https://auth.kotoban.top',
      source: frame,
    } as MessageEvent;
    expect(
      bridge.handleLoginMessage(
        { ...event, origin: 'https://other.test' } as MessageEvent,
        frame,
      ),
    ).toBeUndefined();
    expect(bridge.handleLoginMessage(event, {} as Window)).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    await bridge.handleLoginMessage(event, frame);
    expect(refresh).toHaveBeenCalledOnce();
    expect(new URL(bridge.createLoginUrl('dark')).searchParams.get('app')).toBe(
      'n',
    );
    expect(session.whoami.value.isSignedIn).toBe(true);
  });
  it('ignores a refresh that finishes after logout', async () => {
    storage.setItem('web-kit:session:v1', JSON.stringify({ token: jwt() }));
    let resolve!: (token: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const session = createAuthSession({
      app: 'n',
      requestRefresh: () => pending,
      requestLogout: vi.fn(),
    });
    const refresh = session.accessToken.refresh();
    await session.logout();
    resolve(jwt('stale'));
    await refresh;
    expect(session.whoami.value.isSignedIn).toBe(false);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
  });
});
