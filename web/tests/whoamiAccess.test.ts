import type { AuthUser } from '@novelia/auth-api';
import { createPinia, disposePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  listeners: new Set<(user?: AuthUser) => void>(),
}));

vi.mock('../src/api/auth/session', () => ({
  authApi: {
    watchUser(listener: (user?: AuthUser) => void) {
      session.listeners.add(listener);
      listener(undefined);
      return () => session.listeners.delete(listener);
    },
  },
}));

import { useWhoamiStore } from '../src/stores/useWhoamiStore';

const Now = new Date('2026-10-08T00:00:00Z').getTime();
const ThirtyDays = 30 * 24 * 60 * 60;

function recoverSession(role?: AuthUser['role'], ageSeconds = ThirtyDays) {
  const user: AuthUser | undefined =
    role === undefined
      ? undefined
      : {
          id: 1,
          username: 'test-user',
          role,
          createdAt: Now / 1000 - ageSeconds,
          adminMode: false,
        };
  for (const listener of session.listeners) listener(user);
}

describe('account access after session recovery', () => {
  let pinia: ReturnType<typeof createPinia>;
  let store: ReturnType<typeof useWhoamiStore>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Now);
    session.listeners.clear();
    pinia = createPinia();
    store = useWhoamiStore(pinia);
  });

  afterEach(() => {
    disposePinia(pinia);
    vi.useRealTimers();
  });

  const cases: {
    label: string;
    role?: AuthUser['role'];
    ageSeconds: number;
    nsfw: boolean;
    forum: boolean;
    novel: boolean;
  }[] = [
    {
      label: 'restricted account at 30 days can read NSFW without write access',
      role: 'restricted',
      ageSeconds: ThirtyDays,
      nsfw: true,
      forum: false,
      novel: false,
    },
    {
      label: 'restricted account one second below 30 days cannot read NSFW',
      role: 'restricted',
      ageSeconds: ThirtyDays - 1,
      nsfw: false,
      forum: false,
      novel: false,
    },
    {
      label: 'banned account stays denied even after 30 days',
      role: 'banned',
      ageSeconds: ThirtyDays + 1,
      nsfw: false,
      forum: false,
      novel: false,
    },
    {
      label: 'member at 30 days retains NSFW and write access',
      role: 'member',
      ageSeconds: ThirtyDays,
      nsfw: true,
      forum: true,
      novel: true,
    },
    {
      label: 'young member retains forum access without NSFW or novel writes',
      role: 'member',
      ageSeconds: ThirtyDays - 1,
      nsfw: false,
      forum: true,
      novel: false,
    },
    {
      label: 'trusted account retains NSFW and write access',
      role: 'trusted',
      ageSeconds: ThirtyDays,
      nsfw: true,
      forum: true,
      novel: true,
    },
    {
      label: 'anonymous visitor has no protected access',
      ageSeconds: ThirtyDays,
      nsfw: false,
      forum: false,
      novel: false,
    },
  ];

  it.each(cases)('$label', ({ role, ageSeconds, nsfw, forum, novel }) => {
    recoverSession(role, ageSeconds);

    expect(store.whoami.hasNsfwAccess).toBe(nsfw);
    expect(store.whoami.hasForumAccess).toBe(forum);
    expect(store.whoami.hasNovelAccess).toBe(novel);
    expect(store.whoami.isAdmin).toBe(false);
    expect(store.whoami.asAdmin).toBe(false);
  });

  it('revokes protected access when the recovered account signs out', () => {
    recoverSession('restricted');
    expect(store.whoami.hasNsfwAccess).toBe(true);

    recoverSession();

    expect(store.whoami.isSignedIn).toBe(false);
    expect(store.whoami.hasNsfwAccess).toBe(false);
    expect(store.whoami.hasForumAccess).toBe(false);
    expect(store.whoami.hasNovelAccess).toBe(false);
  });
});
