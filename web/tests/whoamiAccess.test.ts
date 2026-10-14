import type { WhoamiUser as AuthUser } from '@novelia/web-kit';
import { createPinia, disposePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  listeners: new Set<(user?: AuthUser) => void>(),
}));

vi.mock('../src/webKit', async () => {
  const { computed, shallowRef } = await import('vue');
  const { mockWhoami } = await import('./mockWhoami');
  const user = shallowRef<AuthUser>();
  session.listeners.add((value) => {
    user.value = value;
  });
  return {
    isLocalAuth: false,
    webKit: { whoami: computed(() => mockWhoami(user.value)) },
  };
});

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
          createdAt: Now - ageSeconds * 1000,
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
    for (const listener of session.listeners) listener(undefined);
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
    novel: boolean;
  }[] = [
    {
      label: 'restricted account at 30 days can read NSFW without write access',
      role: 'restricted',
      ageSeconds: ThirtyDays,
      nsfw: true,
      novel: false,
    },
    {
      label: 'restricted account one second below 30 days cannot read NSFW',
      role: 'restricted',
      ageSeconds: ThirtyDays - 1,
      nsfw: false,
      novel: false,
    },
    {
      label: 'banned account stays denied even after 30 days',
      role: 'banned',
      ageSeconds: ThirtyDays + 1,
      nsfw: false,
      novel: false,
    },
    {
      label: 'member at 30 days retains NSFW and write access',
      role: 'member',
      ageSeconds: ThirtyDays,
      nsfw: true,
      novel: true,
    },
    {
      label: 'young member has no NSFW or novel write access',
      role: 'member',
      ageSeconds: ThirtyDays - 1,
      nsfw: false,
      novel: false,
    },
    {
      label: 'trusted account retains NSFW and write access',
      role: 'trusted',
      ageSeconds: ThirtyDays,
      nsfw: true,
      novel: true,
    },
    {
      label: 'anonymous visitor has no protected access',
      ageSeconds: ThirtyDays,
      nsfw: false,
      novel: false,
    },
  ];

  it.each(cases)('$label', ({ role, ageSeconds, nsfw, novel }) => {
    recoverSession(role, ageSeconds);

    expect(store.whoami.hasNsfwAccess).toBe(nsfw);
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
    expect(store.whoami.hasNovelAccess).toBe(false);
  });
});
