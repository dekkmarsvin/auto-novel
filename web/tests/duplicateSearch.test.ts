import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useDuplicateSearch } from '../src/pages/novel/duplicateSearch';

describe('Wenku duplicate-search failure fallback', () => {
  it('permits manual confirmation after failure, resetting it when the title changes', async () => {
    const scope = effectScope();
    const title = ref('first');
    const state = scope.run(() =>
      useDuplicateSearch(
        () => title.value,
        vi.fn().mockRejectedValue(new Error('offline')),
      ),
    )!;
    expect(state.canConfirm.value).toBe(false);
    await state.run();
    expect(state.failed.value && state.canConfirm.value).toBe(true);
    title.value = 'second';
    await nextTick();
    expect(state.canConfirm.value).toBe(false);
    scope.stop();
  });
  it('ignores a stale result from a previous title', async () => {
    const scope = effectScope();
    const title = ref('first');
    let resolve!: (items: string[]) => void;
    const state = scope.run(() =>
      useDuplicateSearch(
        () => title.value,
        () =>
          new Promise<string[]>((done) => {
            resolve = done;
          }),
      ),
    )!;
    const pending = state.run();
    title.value = 'second';
    await nextTick();
    resolve(['old result']);
    await pending;
    expect(state.items.value).toBeNull();
    expect(state.canConfirm.value).toBe(false);
    scope.stop();
  });
});
