import { readFileSync } from 'node:fs';
import { PiniaColada } from '@pinia/colada';
import { createPinia, disposePinia } from 'pinia';
import * as Vue from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenericNovelId } from '../src/model/Common';
import Editor from '../src/components/NovelGlossaryEditor.vue';

const transport = vi.hoisted(() => {
  // Compile the SFC during collection, before a case installs its fetch
  // fixture. Browser globals are needed by its import graph, not a Node DOM.
  vi.stubGlobal('Audio', class {});
  vi.stubGlobal('window', new EventTarget());
  return { fetch: vi.fn() };
});
vi.mock('../src/webKit', async () => {
  const { default: ky } = await import('ky');
  const { mockWhoami } = await import('./mockWhoami');
  return {
    isLocalAuth: false,
    webKit: {
      whoami: Vue.ref(mockWhoami()),
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
          retry: 0,
        }),
    },
  };
});
vi.mock('../src/stores', async () => ({
  useWhoamiStore: (await import('../src/stores/useWhoamiStore')).useWhoamiStore,
}));
vi.mock('@vicons/material', () => ({
  DeleteOutlineOutlined: {},
  EditOutlined: {},
}));
vi.mock('@novelia/web-kit', () => ({
  XConfirmDialog: { render: () => null },
  copyToClipboard: vi.fn().mockResolvedValue(undefined),
  Toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    promise: (promise: Promise<unknown>) => promise.catch(() => undefined),
  },
}));
vi.mock('naive-ui', () => ({}));

interface HostNode {
  getRootNode: () => object;
  tag?: string;
  text?: string;
  attrs: Record<string, unknown>;
  children: HostNode[];
  parent?: HostNode;
}
const node = (tag?: string, text?: string): HostNode => ({
  getRootNode: () => ({ activeElement: null }),
  tag,
  text,
  attrs: {},
  children: [],
});
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: (tag) => node(tag),
  createText: (text) => node(undefined, text),
  createComment: () => node(),
  setText: (value, text) => {
    value.text = text;
  },
  setElementText: (value, text) => {
    value.children = [];
    value.text = text;
  },
  patchProp: (value, key, _previous, next) => {
    value.attrs[key] = next;
  },
  parentNode: (value) => value.parent ?? null,
  nextSibling: (value) => {
    const siblings = value.parent?.children ?? [];
    return siblings[siblings.indexOf(value) + 1] ?? null;
  },
  insert(value, parent, anchor) {
    if (value.parent)
      value.parent.children.splice(value.parent.children.indexOf(value), 1);
    value.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(
      index < 0 ? parent.children.length : index,
      0,
      value,
    );
  },
  remove(value) {
    if (value.parent)
      value.parent.children.splice(value.parent.children.indexOf(value), 1);
    value.parent = undefined;
  },
});
const text = (value: HostNode): string =>
  (value.text ?? '') + value.children.map(text).join('');
const findAll = (value: HostNode, tag: string): HostNode[] => [
  ...(value.tag === tag ? [value] : []),
  ...value.children.flatMap((child) => findAll(child, tag)),
];
const button = (value: HostNode, label: string) =>
  findAll(value, 'button').find((entry) => text(entry) === label)!;
const row = (value: HostNode, jp: string) =>
  findAll(value, 'tr').find((entry) =>
    entry.children.some((cell) => cell.tag === 'td' && text(cell) === jp),
  )!;
const click = (value: HostNode) => (value.attrs.onClick as () => void)();
const change = (value: HostNode, input: string) =>
  (value.attrs.onChange as (event: { target: { value: string } }) => void)({
    target: { value: input },
  });
const input = (value: HostNode, content: string) =>
  (value.attrs.onInput as (event: { target: { value: string } }) => void)({
    target: { value: content },
  });

const themes = [
  {
    id: 'theme',
    name: '主題',
    authorUsername: 'owner',
    createAt: 0,
    updateAt: 0,
    glossary: { ウマ: '共用馬', 犬: '狗', 鳥: '鳥' },
  },
  {
    id: 'empty',
    name: '空主題',
    authorUsername: 'owner',
    createAt: 0,
    updateAt: 0,
    glossary: {},
  },
];
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function mountEditor(
  readThemes: () => Promise<Response> = async () => Response.json(themes),
  themeGlossaryId = 'theme',
) {
  vi.stubGlobal('window', new EventTarget());
  const puts: { url: string; method: string; body: unknown }[] = [];
  transport.fetch.mockImplementation(async (request: Request) => {
    if (request.method === 'GET') return readThemes();
    puts.push({
      url: request.url,
      method: request.method,
      body: await request.json(),
    });
    return Response.json({});
  });
  const source = readFileSync(
    new URL('../src/components/NovelGlossaryEditor.vue', import.meta.url),
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + 10,
    source.lastIndexOf('</template>'),
  );
  // Reuse the existing Node host-renderer pattern: real SFC setup and template,
  // with only UI controls replaced by emit-compatible lightweight elements.
  const ClientEditor = {
    ...Editor,
    setup(props: unknown, context: unknown) {
      return { ...Editor.setup(props, context) };
    },
    render: Vue.compile(template),
  };
  const props = Vue.reactive({
    gnid: GenericNovelId.web('syosetu', 'n1'),
    value: { 猫: '貓', ウマ: '本書馬' },
    themeGlossaryId,
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => Vue.h(ClientEditor, props) } },
    ],
  });
  await router.push('/');
  const pinia = createPinia();
  const app = renderer.createApp({ render: () => Vue.h(RouterView) });
  app.use(pinia).use(PiniaColada).use(router);
  const pass = Vue.defineComponent({
    setup:
      (_props, { attrs, slots }) =>
      () =>
        Vue.h('span', attrs, slots.default?.()),
  });
  for (const name of [
    'n-flex',
    'n-h3',
    'n-text',
    'n-input-group',
    'n-scrollbar',
  ])
    app.component(name, pass);
  for (const [name, tag] of [
    ['n-table', 'table'],
    ['n-tag', 'tag'],
  ] as const)
    app.component(
      name,
      Vue.defineComponent({
        setup:
          (_props, { slots }) =>
          () =>
            Vue.h(tag, {}, slots.default?.()),
      }),
    );
  app.component('XConfirmDialog', { render: () => null });
  app.component(
    'n-input',
    Vue.defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          Vue.h('input', {
            value: props.value,
            onInput: (event: { target: { value: string } }) =>
              emit('update:value', event.target.value),
          }),
    }),
  );
  app.component(
    'n-select',
    Vue.defineComponent({
      props: ['value', 'options', 'disabled'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          Vue.h(
            'select',
            {
              value: props.value,
              disabled: props.disabled,
              onChange: (event: { target: { value: string } }) =>
                emit('update:value', event.target.value),
            },
            props.options.map((option: { value: string; label: string }) =>
              Vue.h('option', { value: option.value }, option.label),
            ),
          ),
    }),
  );
  app.component(
    'c-radio-group',
    Vue.defineComponent({
      props: ['value', 'options'],
      emits: ['update:value'],
      setup:
        (props, { emit }) =>
        () =>
          Vue.h(
            'div',
            {},
            props.options.map((option: { value: string; label: string }) =>
              Vue.h(
                'button',
                { onClick: () => emit('update:value', option.value) },
                option.label,
              ),
            ),
          ),
    }),
  );
  app.component(
    'c-button',
    Vue.defineComponent({
      props: ['label', 'disabled', 'title'],
      emits: ['action'],
      setup:
        (props, { emit }) =>
        () =>
          Vue.h(
            'button',
            {
              disabled: props.disabled,
              title: props.title,
              onClick: () => emit('action'),
            },
            props.label,
          ),
    }),
  );
  app.provide(Vue.ssrContextKey, { modules: new Set() });
  const root = node('root');
  app.mount(root);
  cleanups.push(() => {
    app.unmount();
    disposePinia(pinia);
  });
  return { root, puts, props };
}

describe('actual novel glossary editor', () => {
  it('keeps novel terms visible when a shared/override filter loses its theme', async () => {
    const { root } = await mountEditor();
    await vi.waitFor(() => expect(row(root, '犬')).toBeDefined());
    const select = findAll(root, 'select')[0];
    for (const [label, selection] of [
      ['共用 3', ''],
      ['覆盖 1', 'empty'],
    ]) {
      change(select, 'theme');
      await Vue.nextTick();
      click(button(root, label));
      await Vue.nextTick();
      expect(row(root, '猫')).toBeUndefined();
      change(select, selection);
      await Vue.nextTick();
      expect(row(root, '猫')).toBeDefined();
      expect(row(root, 'ウマ')).toBeDefined();
      expect(findAll(root, 'tag')).toHaveLength(0);
    }
  });

  it('reports loading/failure and retries without losing edits or the binding', async () => {
    let resolve!: (value: Response) => void;
    const first = new Promise<Response>((done) => {
      resolve = done;
    });
    const read = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(Response.json(themes));
    const { root, puts } = await mountEditor(read);
    await Vue.nextTick();
    expect(text(root)).toContain('载入共用术语表中…');
    const select = findAll(root, 'select')[0];
    expect(select.attrs.disabled).toBe(true);
    expect(findAll(root, 'tag')).toHaveLength(0);
    input(findAll(row(root, '猫'), 'input')[0], '小貓');
    await Vue.nextTick();
    resolve(Response.json({ message: 'temporary failure' }, { status: 400 }));
    await vi.waitFor(() => expect(text(root)).toContain('共用术语表载入失败'));
    expect(findAll(root, 'tag')).toHaveLength(0);
    expect(findAll(row(root, '猫'), 'input')[0].attrs.value).toBe('小貓');
    expect(select.attrs.disabled).toBe(false);
    expect(select.attrs.value).toBe('theme');
    click(button(root, '重试'));
    await vi.waitFor(() => expect(row(root, '犬')).toBeDefined());
    expect(findAll(row(root, '猫'), 'input')[0].attrs.value).toBe('小貓');
    expect(text(row(root, 'ウマ'))).toContain('覆盖');
    expect(select.attrs.value).toBe('theme');
    expect(puts).toEqual([]);

    const missing = await mountEditor(undefined, 'deleted-theme');
    await vi.waitFor(() =>
      expect(text(missing.root)).toContain(
        '绑定的共用术语表不存在，请重新选择。',
      ),
    );
    expect(findAll(missing.root, 'select')[0].attrs.value).toBe(
      'deleted-theme',
    );
    expect(row(missing.root, '猫')).toBeDefined();
  });

  it('overrides a shared term, deletes back to shared, undoes, and saves only novel terms', async () => {
    const { root, puts } = await mountEditor();
    await vi.waitFor(() => expect(row(root, '犬')).toBeDefined());
    click(findAll(row(root, '犬'), 'button')[0]);
    await Vue.nextTick();
    expect(text(row(root, '犬'))).toContain('覆盖');
    expect(findAll(row(root, '犬'), 'input')[0].attrs.value).toBe('狗');
    input(findAll(row(root, '犬'), 'input')[0], '小狗');
    await Vue.nextTick();
    click(findAll(row(root, '犬'), 'button')[0]);
    await Vue.nextTick();
    expect(text(row(root, '犬'))).toContain('共用');
    expect(findAll(row(root, '犬'), 'input')).toHaveLength(0);
    expect(text(row(root, '犬'))).toContain('狗');
    click(button(root, '撤销删除'));
    await Vue.nextTick();
    expect(findAll(row(root, '犬'), 'input')[0].attrs.value).toBe('小狗');
    click(button(root, '提交'));
    await vi.waitFor(() =>
      expect(puts).toEqual([
        {
          url: 'https://books.test/api/novel/syosetu/n1/glossary',
          method: 'PUT',
          body: {
            glossary: { 猫: '貓', ウマ: '本書馬', 犬: '小狗' },
            themeGlossaryId: 'theme',
          },
        },
      ]),
    );
  });
});
