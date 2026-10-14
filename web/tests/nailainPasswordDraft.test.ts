import { effectScope, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useNailainPasswordDraft } from '../src/pages/other/nailainPasswordDraft';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const owner = ref<string | null>('admin-a');
  const get = deferred<string>();
  const put = deferred<void>();
  const api = {
    getNailainPassword: vi.fn(() => get.promise),
    setNailainPassword: vi.fn(() => put.promise),
  };
  const notify = vi.fn();
  const scope = effectScope();
  const draft = scope.run(() =>
    useNailainPasswordDraft(() => owner.value, api, notify),
  )!;
  return { owner, get, put, api, notify, scope, draft };
}
describe('settings password draft state', () => {
  it('an old administrator GET cannot overwrite a new administrator draft', async () => {
    const s = setup();
    const second = deferred<string>();
    s.api.getNailainPassword.mockImplementationOnce(() => second.promise);
    s.owner.value = 'admin-b';
    s.draft.edit('mock-b-draft');
    s.get.resolve('mock-a-secret');
    await s.get.promise;
    expect(s.draft.password.value).toBe('mock-b-draft');
    expect(s.draft.loading.value).toBe(true);
    second.resolve('mock-b-old');
    await second.promise;
    expect(s.draft.password.value).toBe('mock-b-draft');
    s.scope.stop();
  });
  it('preserves edits before initial GET and saves the new value once loading finishes', async () => {
    const s = setup();
    s.draft.edit('mock-new');
    await s.draft.save();
    expect(s.api.setNailainPassword).not.toHaveBeenCalled();
    s.get.resolve('mock-old');
    await s.get.promise;
    expect(s.draft.password.value).toBe('mock-new');
    const saving = s.draft.save();
    expect(s.api.setNailainPassword).toHaveBeenCalledWith('mock-new');
    await s.draft.save();
    expect(s.api.setNailainPassword).toHaveBeenCalledTimes(1);
    s.put.resolve();
    await saving;
    expect(s.draft.password.value).toBe('');
    expect(s.draft.canSave.value).toBe(false);
    s.scope.stop();
  });
  for (const boundary of ['loss of administrator identity', 'dispose']) {
    it(`clears the draft and ignores late GET on ${boundary}`, async () => {
      const s = setup();
      s.draft.edit('mock-secret');
      if (boundary === 'dispose') s.scope.stop();
      else s.owner.value = null;
      expect(s.draft.password.value).toBe('');
      s.get.resolve('mock-old');
      await s.get.promise;
      expect(s.draft.password.value).toBe('');
      expect(s.notify).not.toHaveBeenCalled();
      s.scope.stop();
    });
  }
  it('suppresses save completion after logout and permits explicit empty saves', async () => {
    const s = setup();
    s.get.resolve('mock-old');
    await s.get.promise;
    s.draft.edit('');
    const saving = s.draft.save();
    expect(s.api.setNailainPassword).toHaveBeenCalledWith('');
    s.owner.value = null;
    s.put.resolve();
    await saving;
    expect(s.notify).not.toHaveBeenCalled();
    expect(s.draft.password.value).toBe('');
    s.scope.stop();
  });
  it('does not expose API exception details or enable saving after failed GET', async () => {
    const s = setup();
    s.get.reject(new Error('mock-private-detail'));
    await s.get.promise.catch(() => {});
    expect(s.draft.canSave.value).toBe(false);
    expect(JSON.stringify(s.notify.mock.calls)).not.toContain(
      'mock-private-detail',
    );
    s.scope.stop();
  });
});
