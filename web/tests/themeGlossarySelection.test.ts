// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import USelect from '@nuxt/ui/components/Select.vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GlossaryButton from '../src/components/GlossaryButton.vue';
import NovelGlossaryEditor from '../src/components/NovelGlossaryEditor.vue';
import { GenericNovelId } from '../src/model/Common';

const transport = vi.hoisted(() => ({
  fetch: vi.fn(),
  errors: [] as unknown[],
}));
vi.mock('../src/webKit', async () => {
  const { default: ky } = await import('ky');
  return {
    isLocalAuth: false,
    webKit: {
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
          retry: 0,
        }),
    },
  };
});
vi.mock('../src/stores', () => ({
  useWhoamiStore: () => Vue.reactive({ whoami: Vue.ref({ isAdmin: false }) }),
  useLocalVolumeStore: vi.fn(),
}));
vi.mock('@pinia/colada', () => ({
  useQueryCache: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../src/api/novel/ThemeGlossaryApi', () => ({
  ThemeGlossaryApi: {
    list: async () => [
      {
        id: '0123456789abcdef01234567',
        name: '共享主題',
        authorUsername: 'owner',
        glossary: { 共通: '共用詞' },
      },
    ],
  },
}));
vi.mock('@novelia/web-kit', () => ({
  XConfirmDialog: { render: () => null },
  Toast: {
    promise: (promise: Promise<unknown>) =>
      promise.catch((error) => {
        transport.errors.push(error);
        throw error;
      }),
  },
  copyToClipboard: vi.fn(),
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('@vicons/material', () => ({
  DeleteOutlineOutlined: {},
  EditOutlined: {},
}));
vi.mock('../src/util', () => ({ downloadFile: vi.fn() }));
let app: Vue.App | undefined;
beforeEach(() => {
  transport.errors.length = 0;
  // jsdom supplies DOM AbortSignals while Node supplies Request. Signal races
  // have separate coverage; bridge only that realm boundary for this UI test.
  const NodeRequest = globalThis.Request;
  vi.stubGlobal(
    'Request',
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, signal: undefined });
      }
    },
  );
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ['editor', 'web'],
  ['editor', 'wenku'],
  ['button', 'web'],
  ['button', 'wenku'],
] as const)(
  'opens the real Nuxt %s selector and saves an unbound %s glossary',
  async (kind, type) => {
    const writes: { path: string; body: unknown }[] = [];
    transport.fetch.mockImplementation(async (request: Request) => {
      writes.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      return new Response(null, { status: 204 });
    });
    const component = kind === 'editor' ? NovelGlossaryEditor : GlossaryButton;
    const name = kind === 'editor' ? 'NovelGlossaryEditor' : 'GlossaryButton';
    const source = readFileSync(`src/components/${name}.vue`, 'utf8');
    const template = source.slice(
      source.indexOf('<template>') + 10,
      source.lastIndexOf('</template>'),
    );
    const props = Vue.reactive({
      gnid:
        type === 'web'
          ? GenericNovelId.web('syosetu', 'fixture')
          : GenericNovelId.wenku('fixture'),
      value: { 固有: '本書詞' },
      themeGlossaryId: '0123456789abcdef01234567' as string | undefined,
    });
    let controls!: { isGlossaryChanged(): boolean };
    const Client = {
      ...component,
      setup(props: unknown, context: unknown) {
        controls = component.setup(props, context) as typeof controls;
        return { ...controls };
      },
      render: Vue.compile(template.replaceAll('(event: Event)', '(event)')),
    };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: Client,
          props: () => ({
            ...props,
            'onUpdate:themeGlossaryId': (id?: string) => {
              props.themeGlossaryId = id;
            },
          }),
        },
      ],
    });
    app = Vue.createApp({ render: () => Vue.h(RouterView) });
    app.use(router);
    const pass = Vue.defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          Vue.h('div', slots.default?.()),
    });
    for (const name of ['UFieldGroup', 'UScrollArea', 'UBadge'])
      app.component(name, pass);
    // Keep Select/Reka real. Other UI shells only forward slots and actions.
    app.component('USelect', USelect);
    app.component(
      'UButton',
      Vue.defineComponent({
        setup:
          (_props, { attrs, slots }) =>
          () =>
            Vue.h('button', { ...attrs, type: 'button' }, slots.default?.()),
      }),
    );
    app.component(
      'ActionButton',
      Vue.defineComponent({
        props: ['action'],
        setup:
          (props, { slots }) =>
          () =>
            Vue.h(
              'button',
              { type: 'button', onClick: () => props.action() },
              slots.default?.(),
            ),
      }),
    );
    for (const name of ['UInput', 'UTextarea'])
      app.component(
        name,
        Vue.defineComponent({
          props: ['modelValue', 'size', 'variant'],
          setup: (props) => () => Vue.h('input', { value: props.modelValue }),
        }),
      );
    app.component('XConfirmDialog', { render: () => null });
    app.component(
      'UModal',
      Vue.defineComponent({
        props: ['open'],
        setup:
          (props, { slots }) =>
          () =>
            props.open
              ? Vue.h('section', [slots.body?.(), slots.footer?.()])
              : null,
      }),
    );
    await router.push('/');
    const host = document.createElement('div');
    document.body.append(host);
    app.mount(host);
    const button = (label: string) =>
      [...document.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
      )!;
    if (kind === 'button') button('术语表[1]').click();
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          '[role="combobox"][aria-label="绑定的共用术语表"]',
        ),
      ).not.toBeNull(),
    );
    const select = document.querySelector<HTMLButtonElement>(
      '[role="combobox"][aria-label="绑定的共用术语表"]',
    )!;
    await vi.waitFor(() => expect(select.textContent).toContain('共享主題'));
    select.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[role="option"]')).not.toBeNull(),
    );
    const none = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((element) => element.textContent?.trim() === '无');
    expect(none).toBeDefined();
    none!.focus();
    none!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await vi.waitFor(() => expect(select.textContent?.trim()).toBe('无'));
    expect(controls.isGlossaryChanged()).toBe(true);
    expect(writes).toEqual([]);
    button('提交').click();
    await Vue.nextTick();
    await Promise.resolve();
    expect(transport.errors).toEqual([]);
    await vi.waitFor(() =>
      expect({ writes, errors: transport.errors }).toEqual({
        errors: [],
        writes: [
          {
            path:
              type === 'web'
                ? '/api/novel/syosetu/fixture/glossary'
                : '/api/wenku/fixture/glossary',
            body: { glossary: { 固有: '本書詞' } },
          },
        ],
      }),
    );
    expect(JSON.stringify(writes)).not.toContain('__no_theme_glossary__');
    await vi.waitFor(() => expect(controls.isGlossaryChanged()).toBe(false));
    expect(props.themeGlossaryId).toBeUndefined();
  },
);
