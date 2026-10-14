import ky from 'ky';
import { describe, expect, it, vi } from 'vitest';
import {
  createNovelClient,
  localWhoami,
  toggleLocalManageMode,
} from '../src/runtimeClients';

describe('local and authenticated API boundaries', () => {
  it('local API uses the existing dev token without invoking kit auth', async () => {
    const kit = { createClient: vi.fn() };
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe('https://local.test/api/novel');
      expect(request.headers.get('Authorization')).toMatch(/^Bearer eyJ/);
      return Response.json({ ok: true });
    });
    const client = createNovelClient(true, kit, 'https://local.test');
    await client.get('novel', { fetch }).json();
    expect(kit.createClient).not.toHaveBeenCalled();
    expect(localWhoami.isSignedIn && localWhoami.isAdmin).toBe(true);
    toggleLocalManageMode();
    expect(localWhoami.asAdmin).toBe(true);
    toggleLocalManageMode();
    expect(localWhoami.asAdmin).toBe(false);
  });
  it('local credentials cannot be sent to an external or auth endpoint', async () => {
    const fetch = vi.fn();
    const client = createNovelClient(
      true,
      { createClient: vi.fn() },
      'https://local.test',
    );
    await expect(
      client.get(new Request('https://external.test/api/novel'), { fetch }),
    ).rejects.toThrow('本地凭据');
    await expect(
      client.get(
        new Request('https://local.test/__local-auth/api/v1/auth/refresh'),
        { fetch },
      ),
    ).rejects.toThrow('本地凭据');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('remote/prod uses the kit client, including its bearer refresh hooks', () => {
    const expected = ky.create();
    const kit = { createClient: vi.fn(() => expected) };
    expect(createNovelClient(false, kit, 'https://books.test')).toBe(expected);
    expect(kit.createClient).toHaveBeenCalledWith('/api/', { timeout: 60_000 });
  });
});
