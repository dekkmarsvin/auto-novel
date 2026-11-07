import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import {
  Toast,
  toastManager,
} from '../node_modules/@novelia/web-kit/src/ui/toast';
import Manager from '../src/pages/workspace/components/ToolboxItemThemeGlossary.vue';

const boundary = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('@novelia/web-kit', async () => ({
  // Use the pinned SDK's rejecting promise implementation, not the retired mock.
  Toast: (await import('../node_modules/@novelia/web-kit/src/ui/toast')).Toast,
  getApiErrorMessage: (
    await import('../node_modules/@novelia/web-kit/src/ui/toast/apiError')
  ).getApiErrorMessage,
  copyToClipboard: boundary.copy,
  XDialog: {},
}));
vi.mock('@vicons/material', () => ({ DeleteOutlineOutlined: {} }));
vi.mock('../src/api/novel/ThemeGlossaryApi', () => ({
  ThemeGlossaryApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../src/stores', () => ({
  useWhoamiStore: () =>
    Vue.reactive({ whoami: Vue.ref({ isAdmin: true, user: undefined }) }),
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
let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  Toast.dismissAll();
  vi.restoreAllMocks();
  boundary.copy.mockReset();
});

async function mount() {
  let controls!: {
    glossary: Vue.Ref<Record<string, string>>;
    exportGlossary(): Promise<void>;
  };
  const app = renderer.createApp({
    setup() {
      controls = Manager.setup!(
        {},
        { emit() {}, expose() {} },
      ) as unknown as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, { modules: new Set() });
  app.mount({});
  unmount = () => app.unmount();
  controls.glossary.value = { 勇者: '勇者' };
  return controls;
}

it('handles a clipboard rejection through the real SDK and retains the theme draft', async () => {
  const notify = vi.spyOn(toastManager, 'add');
  boundary.copy.mockRejectedValue(new Error('clipboard unavailable'));
  const controls = await mount();
  await expect(controls.exportGlossary()).resolves.toBeUndefined();
  expect(controls.glossary.value).toEqual({ 勇者: '勇者' });
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'error',
      description: '导出失败：clipboard unavailable',
    }),
  );
  expect(notify).not.toHaveBeenCalledWith(
    expect.objectContaining({ status: 'success' }),
  );
});

it('exports the existing theme draft with a success notification', async () => {
  const notify = vi.spyOn(toastManager, 'add');
  boundary.copy.mockResolvedValue(undefined);
  const controls = await mount();
  await controls.exportGlossary();
  expect(boundary.copy).toHaveBeenCalledOnce();
  expect(boundary.copy.mock.calls[0][0]).toContain('勇者');
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'success',
      description: '导出成功：已复制到剪贴板',
    }),
  );
});
