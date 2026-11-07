import * as Vue from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlossaryButton from '../src/components/GlossaryButton.vue';
import { GenericNovelId } from '../src/model/Common';

const boundary = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('../src/api', () => ({
  WebNovelApi: { updateGlossary: boundary.update },
  WenkuNovelApi: { updateGlossary: boundary.update },
}));
vi.mock('../src/api/novel/ThemeGlossaryApi', () => ({
  ThemeGlossaryApi: { list: async () => [] },
}));
vi.mock('../src/stores', () => ({
  useWhoamiStore: () => Vue.reactive({ whoami: Vue.ref({ isAdmin: false }) }),
  useLocalVolumeStore: vi.fn(),
}));
vi.mock('../src/util', () => ({ downloadFile: vi.fn() }));
vi.mock('@pinia/colada', () => ({
  useQueryCache: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: { promise: (promise: Promise<unknown>) => promise },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

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
const cleanups: (() => void)[] = [];
beforeEach(() => boundary.update.mockReset().mockResolvedValue(undefined));
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));

function mount() {
  const props = Vue.reactive({
    gnid: GenericNovelId.web('syosetu', 'n1'),
    value: { 猫: '貓' },
    themeGlossaryId: 'theme',
  });
  let controls!: {
    glossary: Vue.Ref<Record<string, string>>;
    termsToAdd: Vue.Ref<[string, string]>;
    localThemeGlossaryId: Vue.Ref<string | null>;
    showGlossaryModal: Vue.Ref<boolean>;
    showConfirmModal: Vue.Ref<boolean>;
    toggleGlossaryModal(): Promise<void>;
    handleUpdateShow(show: boolean): void;
    handleConfirmClose(): void;
    handleConfirmCancel(): void;
    isGlossaryChanged(): boolean;
    submitGlossary(): Promise<unknown>;
  };
  const emit = vi.fn();
  const app = renderer.createApp({
    setup() {
      controls = GlossaryButton.setup!(props, {
        expose() {},
        emit,
      }) as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  return { controls, props, emit };
}

it('protects either unadded input when closing and clears it after confirmed discard/reopen', async () => {
  const { controls } = mount();
  await controls.toggleGlossaryModal();
  for (const terms of [
    ['新語', ''],
    ['', '新詞'],
  ] as [string, string][]) {
    controls.termsToAdd.value = terms;
    controls.handleUpdateShow(false);
    expect(controls.showGlossaryModal.value).toBe(true);
    expect(controls.showConfirmModal.value).toBe(true);
    controls.handleConfirmCancel();
    expect(controls.termsToAdd.value).toEqual(terms);
  }
  controls.handleConfirmClose();
  expect(controls.showGlossaryModal.value).toBe(false);
  await controls.toggleGlossaryModal();
  expect(controls.termsToAdd.value).toEqual(['', '']);
  expect(controls.isGlossaryChanged()).toBe(false);
});

it('retains the draft and binding after a rejected save, then accepts only the successful snapshot', async () => {
  const { controls, props, emit } = mount();
  await controls.toggleGlossaryModal();
  controls.glossary.value.猫 = '小貓';
  controls.localThemeGlossaryId.value = 'next-theme';
  controls.termsToAdd.value = ['尚未添加', ''];
  boundary.update.mockRejectedValueOnce(new Error('offline'));
  await expect(controls.submitGlossary()).resolves.toBeUndefined();
  expect(props.value).toEqual({ 猫: '貓' });
  expect(emit).not.toHaveBeenCalled();
  expect(controls.isGlossaryChanged()).toBe(true);
  await controls.submitGlossary();
  expect(boundary.update).toHaveBeenLastCalledWith('syosetu', 'n1', {
    glossary: { 猫: '小貓' },
    themeGlossaryId: 'next-theme',
  });
  expect(props.value).toEqual({ 猫: '小貓' });
  expect(emit).toHaveBeenCalledWith('update:themeGlossaryId', 'next-theme');
  expect(controls.isGlossaryChanged()).toBe(true);
  controls.termsToAdd.value = ['', ''];
  expect(controls.isGlossaryChanged()).toBe(false);
});
