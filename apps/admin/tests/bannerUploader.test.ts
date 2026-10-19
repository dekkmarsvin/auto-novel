import * as Vue from 'vue';
import { afterEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  load: vi.fn(),
  compress: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../src/api', () => ({
  imageAccept: 'image/png',
  validateImage() {},
  useBannerApi: () => ({ upload: boundary.upload, create: boundary.create }),
}));
vi.mock('@novelia/web-kit', () => ({
  Toast: { error: vi.fn(), success: vi.fn() },
  XDropZone: {},
  getApiErrorMessage: (error: Error) => error.message,
}));
vi.mock('../src/views/banners/bannerImage', () => ({
  canCompressBannerImage: () => true,
  compressBannerImage: boundary.compress,
  defaultWebpQuality: 0.65,
  loadBannerImage: boundary.load,
}));
vi.mock('../src/views/banners/BannerPreview.vue', () => ({ default: {} }));
vi.mock('../src/views/banners/BannerImageInfo.vue', () => ({ default: {} }));
vi.mock('../src/views/banners/WebpCompressionPanel.vue', () => ({
  default: {},
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
afterEach(() => vi.restoreAllMocks());

it('does not create an orphan preview URL when WebP encoding finishes after unmount', async () => {
  const original = new File(['original-image'], 'one.png', {
    type: 'image/png',
  });
  boundary.load.mockResolvedValue({
    file: original,
    url: 'blob:original',
    width: 1000,
    height: 500,
  });
  let finish!: (file: File) => void;
  boundary.compress.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const createUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:compressed');
  const revokeUrl = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
  const { default: Uploader } =
    await import('../src/views/banners/BannerUploader.vue');
  let controls!: {
    add(files: File[]): Promise<void>;
    compressSelected(): Promise<void>;
  };
  const app = renderer.createApp({
    setup() {
      controls = Uploader.setup!(Vue.reactive({ disabled: false }), {
        emit() {},
        expose() {},
      }) as unknown as typeof controls;
      return () => null;
    },
  });
  app.provide(Vue.ssrContextKey, {});
  app.mount({});
  try {
    await controls.add([original]);
    const pending = controls.compressSelected();
    app.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:original');
    finish(new File(['smaller'], 'one.webp', { type: 'image/webp' }));
    await pending;
    expect(createUrl).not.toHaveBeenCalled();
    expect(boundary.upload).not.toHaveBeenCalled();
  } finally {
    if (app._instance) app.unmount();
  }
});
