import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/api', () => ({ BannerApi: { list } }));
vi.mock('@novelia/web-kit', async () => {
  const { useLocalStorage } =
    await import('../node_modules/@novelia/web-kit/src/utils/storage');
  return { useLocalStorage };
});
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
let images: FixtureImage[];
class FixtureImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1600;
  naturalHeight = 400;
  src = '';
  constructor() {
    images.push(this);
  }
}
const storageKey = 'auto-novel:banner:v1';
let store: Map<string, string>;
const storedId = () => JSON.parse(store.get(storageKey)!).selection?.bannerId;
const banners = [1, 2].map((id) => ({
  id,
  type: 0,
  imageUrl: `https://images.example/${id}.webp`,
  linkUrl: null,
  sortOrder: id,
  focalX: 0.5,
  focalY: 0.5,
}));
beforeEach(() => {
  store = new Map();
  images = [];
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener() {},
  });
  vi.stubGlobal('Image', FixtureImage);
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.resetModules();
  vi.doMock('@/repos', async () => import('../src/repos/useBanner'));
  list.mockReset();
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function flush() {
  for (let i = 0; i < 8; i++) await Vue.nextTick();
}
async function mount() {
  const { useBannerImage } = await import('../src/pages/home/useBannerImage');
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
    list.mockReturnValue(
      new Promise((resolve, reject) => {
        finish = () =>
          result === 'error' ? reject(new Error('offline')) : resolve([]);
      }),
    );
    const { controls } = await mount();
    controls.imageLoaded(loaded);
    finish();
    await flush();
    expect(controls.imageUrl.value).toBe(fallback);
    expect(controls.loading.value).toBe(false);
    expect(controls.imagePosition.value).toBe('50% 0%');
  },
);

it('falls back for a broken API image and removes it only when the fallback itself fails', async () => {
  list.mockResolvedValue([banners[0]]);
  const { controls } = await mount();
  await flush();
  expect(controls.imageUrl.value).toBe(banners[0].imageUrl);
  controls.showFallback();
  expect(controls.imageUrl.value).toBe(fallback);
  controls.showFallback();
  expect(controls.imageUrl.value).toBe('');
  expect(controls.loading.value).toBe(false);
});

it('ignores a pending API response after unmount without scheduling rotation', async () => {
  let finish!: (data: unknown) => void;
  list.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { controls, dispose } = await mount();
  dispose();
  cleanup.pop();
  finish(banners);
  await flush();
  expect(controls.imageUrl.value).toBe(fallback);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the displayed and persisted banner on failed switching, then commits a successful retry', async () => {
  list.mockResolvedValue(banners);
  const { controls } = await mount();
  await flush();
  controls.imageLoaded(loaded);
  const failed = controls.nextBanner();
  await flush();
  expect(storedId()).toBe(1);
  images[0].onerror!();
  await failed;
  expect(controls.imageUrl.value).toBe(banners[0].imageUrl);
  expect(storedId()).toBe(1);
  expect(controls.switchError.value).toContain('切换失败');

  const success = controls.nextBanner();
  await flush();
  expect(storedId()).toBe(1);
  images[1].onload!();
  await success;
  expect(controls.imageUrl.value).toBe(banners[1].imageUrl);
  expect(storedId()).toBe(2);
  const repo = (await import('../src/repos/useBanner')).BannerRepo;
  expect(repo.peek()?.banner.id).toBe(2);
});

it('cancels an in-flight image preload and its timeout when leaving the page', async () => {
  list.mockResolvedValue(banners);
  const { controls, dispose } = await mount();
  await flush();
  controls.imageLoaded(loaded);
  const pending = controls.nextBanner();
  await flush();
  expect(images[0].src).toBe(banners[1].imageUrl);
  dispose();
  cleanup.pop();
  await pending;
  expect(images[0].src).toBe('');
  expect(images[0].onload).toBeNull();
  expect(images[0].onerror).toBeNull();
  expect(storedId()).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
