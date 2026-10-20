import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Finish cold SFC compilation before a case installs its pending API response.
import Setting from '../src/pages/other/Setting.vue';

const api = vi.hoisted(() => ({
  getNailainPassword: vi.fn(),
  setNailainPassword: vi.fn(),
}));
vi.mock('../src/api', () => ({ SiteSettingApi: api }));
vi.mock('@vicons/material', () => ({ InfoOutlined: {} }));
vi.mock('@novelia/web-kit', () => ({
  Toast: { success: vi.fn(), error: vi.fn() },
  useWebKit: () => ({
    theme: { preference: Vue.ref('light'), setPreference: vi.fn() },
  }),
}));
vi.mock('../src/stores', () => {
  const account = Vue.reactive({
    whoami: Vue.ref({
      isAdmin: true,
      isSignedIn: true,
      user: { id: 1, username: 'mock-admin' },
    }),
  });
  const settings = Vue.reactive({ setting: Vue.ref({}) });
  return {
    Setting: { themeOptions: [], paginationModeOptions: [], localeOptions: [] },
    useWhoamiStore: () => account,
    useSettingStore: () => settings,
    useWebSearchHistoryStore: () => ({ clear: vi.fn() }),
    useWenkuSearchHistoryStore: () => ({ clear: vi.fn() }),
  };
});
vi.mock('naive-ui', () => {
  const pass = Vue.defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        Vue.h('div', slots.default?.()),
  });
  return {
    ...Object.fromEntries(
      [
        'NH1',
        'NList',
        'NListItem',
        'NFlex',
        'NUl',
        'NLi',
        'NTooltip',
        'NButton',
        'NIcon',
        'NCheckbox',
        'NInputGroup',
        'NInput',
      ].map((name) => [name, pass]),
    ),
  };
});
vi.mock('../src/components/CButton.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../src/components/CRadioGroup.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../src/components/TranslatorCheck.vue', () => ({
  default: { render: () => null },
}));

interface HostNode {
  tag?: string;
  text?: string;
  attrs: Record<string, unknown>;
  children: HostNode[];
  parent?: HostNode;
}
const node = (tag?: string, text?: string): HostNode => ({
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
function find(
  value: HostNode,
  tag: string,
  text?: string,
): HostNode | undefined {
  if (value.tag === tag && (text === undefined || value.text === text))
    return value;
  for (const child of value.children) {
    const match = find(child, tag, text);
    if (match) return match;
  }
}
let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.clearAllMocks();
});

describe('NAILAIN Setting.vue input and save integration', () => {
  it('saves the typed password after an older initial read completes', async () => {
    let completeRead!: (value: string) => void;
    api.getNailainPassword.mockImplementation(
      () => new Promise<string>((resolve) => (completeRead = resolve)),
    );
    api.setNailainPassword.mockResolvedValue(undefined);
    // Vite's SSR SFC transform retains the real setup. Compile its template for
    // reactive host rendering, as in the existing homepage boundary tests.
    const source = readFileSync(
      new URL('../src/pages/other/Setting.vue', import.meta.url),
      'utf8',
    );
    const template = source.slice(
      source.indexOf('<template>') + '<template>'.length,
      source.lastIndexOf('</template>'),
    );
    const app = renderer.createApp({
      ...Setting,
      setup(props: unknown, context: unknown) {
        return { ...Setting.setup(props, context) };
      },
      render: Vue.compile(template),
    });
    const pass = Vue.defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          Vue.h('div', slots.default?.()),
    });
    for (const name of [
      'n-h1',
      'n-list',
      'n-list-item',
      'n-flex',
      'n-ul',
      'n-li',
      'n-tooltip',
      'n-button',
      'n-icon',
      'n-checkbox',
      'n-input-group',
      'c-radio-group',
      'translator-check',
    ])
      app.component(name, pass);
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
      'c-button',
      Vue.defineComponent({
        props: ['label', 'disabled'],
        emits: ['action'],
        setup:
          (props, { emit }) =>
          () =>
            Vue.h(
              'button',
              { disabled: props.disabled, onClick: () => emit('action') },
              props.label,
            ),
      }),
    );
    app.provide(Vue.ssrContextKey, { modules: new Set() });
    const root = node('root');
    app.mount(root);
    unmount = () => app.unmount();
    expect(api.getNailainPassword).toHaveBeenCalledTimes(1);
    const input = find(root, 'input')!;
    const save = find(root, 'button', '保存')!;
    expect(save.attrs.disabled).toBe(true);
    (input.attrs.onInput as (event: { target: { value: string } }) => void)({
      target: { value: 'mock-new-month' },
    });
    await Vue.nextTick();
    completeRead('mock-old-month');
    await vi.waitFor(() => expect(save.attrs.disabled).toBe(false));
    expect(input.attrs.value).toBe('mock-new-month');
    (save.attrs.onClick as () => void)();
    await vi.waitFor(() =>
      expect(api.setNailainPassword).toHaveBeenCalledWith('mock-new-month'),
    );
    await Vue.nextTick();
    expect(input.attrs.value).toBe('');
  });
});
