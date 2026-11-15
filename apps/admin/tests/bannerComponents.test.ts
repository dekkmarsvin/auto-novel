// @vitest-environment jsdom
import { createApp, nextTick, type SetupContext } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/api', () => ({
  useBannerApi: () => ({
    list: async () => [
      {
        id: 1,
        type: 0,
        key: 'one.webp',
        imageUrl: '/one.webp',
        linkUrl: null,
        sortOrder: 0,
        focalX: 0.5,
        focalY: 0.5,
      },
    ],
  }),
}));
vi.mock('@novelia/web-kit', async () => {
  const { h } = await import('vue');
  return {
    XPage: {
      setup:
        (_: unknown, { slots }: SetupContext) =>
        () =>
          h('main', slots.default?.()),
    },
    Toast: { promise: (value: Promise<unknown>) => value },
    getApiErrorMessage: (error: Error) => error.message,
  };
});
// Keep the real host template, and exercise component resolution without the
// UI library's browser geometry/teleport machinery in this host-only test.
vi.mock('@nuxt/ui/components/PageHeader.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['title'],
      setup: (props: { title: string }) => () => h('h1', props.title),
    },
  };
});
vi.mock('@nuxt/ui/components/Modal.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['open'],
      setup:
        (props: { open: boolean }, { slots }: SetupContext) =>
        () =>
          props.open
            ? h('section', { role: 'dialog' }, [
                slots.body?.(),
                slots.footer?.(),
              ])
            : null,
    },
  };
});
vi.mock('@nuxt/ui/components/Slider.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['modelValue', 'disabled'],
      setup: (props: { modelValue: number; disabled: boolean }) => () =>
        h('input', {
          type: 'range',
          value: props.modelValue,
          disabled: props.disabled,
        }),
    },
  };
});
vi.mock('../src/views/banners/BannerUploader.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../src/views/banners/ImageCompare.vue', () => ({
  default: { render: () => null },
}));

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));

it('resolves the Admin header, deletion dialog and focal sliders without global component registration', async () => {
  const { default: View } = await import(
    '../src/views/banners/BannersView.vue'
  );
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(View);
  const warnings: string[] = [];
  app.config.warnHandler = (warning) => warnings.push(warning);
  app.mount(root);
  cleanup.push(() => {
    app.unmount();
    root.remove();
  });
  await nextTick();
  await nextTick();
  const click = async (text: string) => {
    const button = [...root.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === text,
    );
    expect(button, `button ${text}`).toBeDefined();
    button!.click();
    await nextTick();
  };
  expect(root.querySelector('h1')?.textContent).toBe('Banner 管理');
  await click('删除');
  expect(root.querySelector('[role="dialog"]')?.textContent).toContain(
    'Banner #1',
  );
  await click('取消');
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  await click('编辑');
  await click('桌面模拟');
  expect(root.querySelectorAll('input[type="range"]')).toHaveLength(2);
  expect(
    warnings.filter((warning) =>
      warning.includes('Failed to resolve component'),
    ),
  ).toEqual([]);
});
