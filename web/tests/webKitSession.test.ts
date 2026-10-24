import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Exercise the immutable SDK's real session without mounting its UI.
import { createAuthSession } from '../node_modules/@novelia/web-kit/src/auth/session';
import { migrateLegacyStorage } from '../src/storageMigration.js';
import { isCurrentAuthor } from '../src/identity';

const now = 2_000_000_000_000;
const jwt = (username = 'reader', uid = 7) =>
  `h.${Buffer.from(JSON.stringify({ uid, sub: username, role: 'member', crat: 0, iat: now / 1000, exp: now / 1000 + 3600 })).toString('base64url')}.s`;
let storage: Storage;
let browser: EventTarget;
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
  browser = new EventTarget();
  Object.assign(browser, { localStorage: storage });
  vi.stubGlobal('window', browser);
});

function externalSession(token?: string) {
  if (token) {
    storage.setItem(
      'web-kit:session:v1',
      JSON.stringify({ token, adminMode: false }),
    );
  } else {
    storage.removeItem('web-kit:session:v1');
  }
  browser.dispatchEvent(
    Object.assign(new Event('storage'), {
      key: 'web-kit:session:v1',
      storageArea: storage,
    }),
  );
}
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
      login: vi.fn(),
      refresh: requestRefresh,
      logout: vi.fn().mockResolvedValue(''),
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
  it('recovers a Cookie session with the real SDK and preserves glossary ownership', async () => {
    const refresh = vi.fn().mockResolvedValue(jwt());
    const session = createAuthSession({
      login: vi.fn(),
      refresh,
      logout: vi.fn().mockResolvedValue(''),
    });
    expect(await session.checkSignedIn()).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(session.whoami.value.user?.id).toBe(7);
    expect(isCurrentAuthor(session.whoami.value, 'reader')).toBe(true);
    expect(JSON.parse(storage.getItem('web-kit:session:v1')!).token).toBe(
      jwt(),
    );
  });
  it('restores the existing new session instead of replacing it with a legacy account', async () => {
    storage.setItem('auth-v2', JSON.stringify({ token: jwt('legacy') }));
    storage.setItem(
      'web-kit:session:v1',
      JSON.stringify({ token: jwt('current', 8), adminMode: false }),
    );
    migrateLegacyStorage(storage, now);
    const refresh = vi.fn();
    const session = createAuthSession({
      login: vi.fn(),
      refresh,
      logout: vi.fn().mockResolvedValue(''),
    });
    expect(await session.checkSignedIn()).toBe(true);
    expect(session.whoami.value.user?.id).toBe(8);
    expect(isCurrentAuthor(session.whoami.value, 'current')).toBe(true);
    expect(isCurrentAuthor(session.whoami.value, 'legacy')).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(storage.getItem('auth-v2')).toBeNull();
  });
  it('does not restore a legacy account when the SDK rejects an existing new key', async () => {
    storage.setItem('auth-v2', JSON.stringify({ token: jwt('legacy') }));
    storage.setItem('web-kit:session:v1', 'invalid-current');
    migrateLegacyStorage(storage, now);
    const session = createAuthSession({
      login: vi.fn(),
      refresh: vi.fn().mockRejectedValue(new Error('offline')),
      logout: vi.fn().mockResolvedValue(''),
    });
    expect(await session.checkSignedIn()).toBe(false);
    expect(session.whoami.value.user).toBeUndefined();
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
    migrateLegacyStorage(storage, now);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
  });
  it('ignores a refresh that finishes after logout', async () => {
    storage.setItem('web-kit:session:v1', JSON.stringify({ token: jwt() }));
    let resolve!: (token: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const session = createAuthSession({
      login: vi.fn(),
      refresh: () => pending,
      logout: vi.fn().mockResolvedValue(''),
    });
    const refresh = session.accessToken.refresh();
    await session.logout();
    resolve(jwt('stale'));
    await refresh;
    expect(session.whoami.value.isSignedIn).toBe(false);
    expect(storage.getItem('web-kit:session:v1')).toBeNull();
  });
  it.each(['logout', 'switch'] as const)(
    'ignores an old account refresh after another tab performs %s',
    async (operation) => {
      storage.setItem('web-kit:session:v1', JSON.stringify({ token: jwt() }));
      let resolve!: (token: string) => void;
      const pending = new Promise<string>((done) => {
        resolve = done;
      });
      const session = createAuthSession({
        login: vi.fn(),
        refresh: () => pending,
        logout: vi.fn().mockResolvedValue(''),
      });
      const refresh = session.accessToken.refresh();
      externalSession(operation === 'switch' ? jwt('other', 8) : undefined);
      resolve(jwt('stale'));
      await refresh;
      expect(session.whoami.value.isSignedIn).toBe(operation === 'switch');
      expect(session.whoami.value.user?.username).toBe(
        operation === 'switch' ? 'other' : undefined,
      );
      expect(isCurrentAuthor(session.whoami.value, 'reader')).toBe(false);
      expect(storage.getItem('web-kit:session:v1')).toBe(
        operation === 'switch'
          ? JSON.stringify({ token: jwt('other', 8), adminMode: false })
          : null,
      );
    },
  );
});
