import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBannerImage } from '../src/pages/home/useBannerImage';

const boundary = vi.hoisted(() => ({ peek: vi.fn(), current: vi.fn() }));
vi.mock('@/repos', () => ({
  BannerRepo: boundary,
  objectPosition: () => '50% 50%',
}));
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue');
  return { useElementSize: () => ({ width: ref(1000), height: ref(225) }) };
});

const renderer = Vue.createRenderer<object, object>({
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  patchProp() {},
  insert() {},
  remove() {},
  parentNode: () => null,
  nextSibling: () => null,
});
const cleanup: (() => void)[] = [];
beforeEach(() => {
  boundary.peek.mockReset();
  boundary.current.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
});

function mount() {
  let controls!: ReturnType<typeof useBannerImage>;
  const app = renderer.createApp({
    setup() {
      controls = useBannerImage();
      return () => null;
    },
  });
  app.mount({});
  const dispose = () => app.unmount();
  cleanup.push(dispose);
  return { controls, dispose };
}
const loaded = {
  target: { naturalWidth: 1600, naturalHeight: 400 },
} as unknown as Event;
const fallback = '/files-extra/banner.v1.webp';

it.each(['empty', 'error'])(
  'keeps the working static image when the API returns %s',
  async (result) => {
    let finish!: () => void;
    boundary.current.mockReturnValue(
      new Promise((resolve, reject) => {
        finish = () =>
          result === 'error'
            ? reject(new Error('offline'))
            : resolve(undefined);
      }),
    );
    const { controls } = mount();
    expect(controls.imageUrl.value).toBe(fallback);
    controls.imageLoaded(loaded);
    finish();
    await Vue.nextTick();
    await Vue.nextTick();
    expect(controls.imageUrl.value).toBe(fallback);
    expect(controls.loading.value).toBe(false);
    expect(controls.imagePosition.value).toBe('50% 0%');
  },
);

it('falls back for a broken API image and removes the image only if that fallback itself fails', async () => {
  boundary.current.mockResolvedValue({
    banner: {
      imageUrl: 'https://images.example/one.webp',
      focalX: 0.5,
      focalY: 0.5,
    },
    expiresAt: Date.now() + 7200000,
  });
  const { controls } = mount();
  await Vue.nextTick();
  await Vue.nextTick();
  expect(controls.imageUrl.value).toBe('https://images.example/one.webp');
  controls.showFallback();
  expect(controls.imageUrl.value).toBe(fallback);
  expect(controls.loading.value).toBe(true);
  controls.showFallback();
  expect(controls.imageUrl.value).toBe('');
  expect(controls.loading.value).toBe(false);
});

it('disposes the rotation timer and ignores a pending response after unmount', async () => {
  let finish!: (selection: unknown) => void;
  boundary.current.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { controls, dispose } = mount();
  dispose();
  cleanup.pop();
  finish({
    banner: { imageUrl: '/late.webp' },
    expiresAt: Date.now() + 7200000,
  });
  await Vue.nextTick();
  await Vue.nextTick();
  expect(controls.imageUrl.value).toBe(fallback);
  expect(vi.getTimerCount()).toBe(0);
});
