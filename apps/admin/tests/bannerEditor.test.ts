import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
vi.mock('../src/api', async (original) => ({
  ...(await original<object>()),
  useBannerApi: () => boundary,
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: { promise: (value: Promise<unknown>) => value.catch(() => undefined) },
  XDialog: {},
  uploadFile: vi.fn(),
  getApiErrorMessage: (error: Error) => error.message,
}));
vi.mock('../src/views/banners/BannerUploader.vue', () => ({ default: {} }));
vi.mock('../src/views/banners/BannerPreview.vue', () => ({ default: {} }));

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
const banner = {
  id: 1,
  type: 0,
  key: 'banners/one.webp',
  imageUrl: '/one.webp',
  linkUrl: null,
  sortOrder: 0,
  focalX: 0.5,
  focalY: 0.5,
};
beforeEach(() => {
  boundary.list.mockReset().mockResolvedValue([{ ...banner }]);
  boundary.update.mockReset();
});
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
});
interface Controls {
  activeTab: Vue.Ref<string>;
  editing: Vue.Ref<boolean>;
  saving: Vue.Ref<boolean>;
  draftFocalX: Vue.Ref<number>;
  selected: Vue.ComputedRef<typeof banner>;
  startEdit(): void;
  cancelEdit(): void;
  selectTab(tab: string): void;
  navigateTabs(event: KeyboardEvent): void;
  saveEdit(): Promise<void>;
}
async function mount() {
  const { default: View } =
    await import('../src/views/banners/BannersView.vue');
  let controls!: Controls;
  const app = renderer.createApp({
    setup() {
      controls = View.setup!(
        {},
        { emit() {}, expose() {} },
      ) as unknown as Controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanup.push(() => app.unmount());
  await Vue.nextTick();
  await Vue.nextTick();
  return controls;
}

it('keeps a slow save in the same editor until its response is applied', async () => {
  let finish!: (value: unknown) => void;
  boundary.update.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const controls = await mount();
  controls.startEdit();
  controls.draftFocalX.value = 0.6;
  const pending = controls.saveEdit();
  controls.selectTab('upload');
  controls.navigateTabs({ key: 'ArrowRight' } as KeyboardEvent);
  controls.cancelEdit();
  controls.startEdit();
  await Vue.nextTick();
  expect(controls.activeTab.value).toBe('manage');
  expect(controls.editing.value).toBe(true);
  expect(controls.saving.value).toBe(true);
  expect(controls.draftFocalX.value).toBe(0.6);
  finish({ ...banner, focalX: 0.6 });
  await pending;
  expect(controls.selected.value.focalX).toBe(0.6);
  expect(controls.editing.value).toBe(false);
  controls.startEdit();
  expect(controls.draftFocalX.value).toBe(0.6);
});

it('retains the draft on save failure and applies a successful retry', async () => {
  boundary.update
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...banner, focalX: 0.7 });
  const controls = await mount();
  controls.startEdit();
  controls.draftFocalX.value = 0.7;
  await controls.saveEdit();
  expect(controls.saving.value).toBe(false);
  expect(controls.editing.value).toBe(true);
  expect(controls.draftFocalX.value).toBe(0.7);
  expect(controls.selected.value.focalX).toBe(0.5);
  await controls.saveEdit();
  expect(controls.selected.value.focalX).toBe(0.7);
  expect(controls.editing.value).toBe(false);
});
