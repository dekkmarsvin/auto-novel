import { PiniaColada } from '@pinia/colada';
import { createPinia, disposePinia } from 'pinia';
import * as Vue from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { readFileSync } from 'node:fs';
import type { WhoamiUser } from '@novelia/web-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({
  listeners: new Set<(user?: WhoamiUser) => void>(),
}));
const transport = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@vicons/material', () => ({
  BookOutlined: {},
  LanguageOutlined: {},
  ReadMoreOutlined: {},
  StarBorderOutlined: {},
}));
vi.mock('../src/webKit', async () => {
  const { computed, shallowRef } = await import('vue');
  const { default: ky } = await import('ky');
  const { mockWhoami } = await import('./mockWhoami');
  const user = shallowRef<WhoamiUser>();
  account.listeners.add((value) => {
    user.value = value;
  });
  return {
    isLocalAuth: false,
    webKit: {
      whoami: computed(() => mockWhoami(user.value)),
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: transport.fetch,
          hooks: {
            beforeRequest: [
              ({ request }) => {
                if (user.value)
                  request.headers.set(
                    'Authorization',
                    `Bearer test-${user.value.id}`,
                  );
              },
            ],
          },
        }),
    },
  };
});
vi.mock('../src/stores', async () => ({
  useWhoamiStore: (await import('../src/stores/useWhoamiStore')).useWhoamiStore,
}));
vi.mock('../src/repos', async () => {
  const { ref } = await import('vue');
  const publicPage = () => ({ data: ref({ items: [] }), error: ref(null) });
  return {
    WebNovelRepo: { useWebNovelList: publicPage },
    WenkuNovelRepo: { useWenkuNovelList: publicPage },
  };
});
vi.mock('../src/pages/util', async () => ({
  useBreakPoints: () => ({ smaller: () => Vue.ref(false) }),
}));
vi.mock('naive-ui', () => {
  const pass = Vue.defineComponent({
    setup:
      (_props, { attrs, slots }) =>
      () =>
        Vue.h('div', attrs, slots.default?.()),
  });
  return Object.fromEntries(
    [
      'NFlex',
      'NButton',
      'NInput',
      'NInputGroup',
      'NH1',
      'NA',
      'NP',
      'NIcon',
      'NDivider',
      'NQrCode',
    ]
      .map((key) => [key, pass])
      .concat([['useThemeVars', () => ({ bodyColor: '#fff' })]]),
  );
});
vi.mock('../src/pages/home/components/PanelWebNovel.vue', () => ({
  default: Vue.defineComponent({
    props: ['novels', 'error'],
    setup: (props) => () =>
      Vue.h(
        'div',
        {},
        props.novels
          ?.map((novel: { titleJp: string }) => novel.titleJp)
          .join('|') ?? '',
      ),
  }),
}));
vi.mock('../src/pages/home/components/PanelWenkuNovel.vue', () => ({
  default: { render: () => Vue.h('div') },
}));
vi.mock('../src/components/CModal.vue', () => ({
  default: { render: () => Vue.h('div') },
}));
vi.mock('../src/components/CButton.vue', () => ({
  default: { render: () => Vue.h('button') },
}));
vi.mock('../src/components/SectionHeader.vue', () => ({
  default: { render: () => Vue.h('div') },
}));
vi.mock('../src/components/Bulletin.vue', () => ({
  default: {
    render() {
      return Vue.h('div', {}, this.$slots.default?.());
    },
  },
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
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function signIn(id?: number) {
  for (const listener of account.listeners)
    listener(
      id === undefined
        ? undefined
        : {
            id,
            username: `user-${id}`,
            role: 'member',
            createdAt: 0,
            adminMode: false,
          },
    );
}
const content = (value: HostNode): string =>
  `${value.text ?? ''} ${Object.values(value.attrs)
    .filter((item) => typeof item === 'string')
    .join(' ')} ${value.children.map(content).join(' ')}`;
async function setup() {
  const requests: { request: Request; resolve: (value: Response) => void }[] =
    [];
  transport.fetch.mockReset().mockImplementation(
    (request: Request) =>
      new Promise<Response>((resolve, reject) => {
        requests.push({ request, resolve });
        request.signal.addEventListener(
          'abort',
          () => reject(request.signal.reason),
          { once: true },
        );
      }),
  );
  const pinia = createPinia();
  const app = renderer.createApp({ render: () => null });
  app.use(pinia);
  app.use(PiniaColada, {
    queryOptions: { refetchOnWindowFocus: false, refetchOnReconnect: false },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }],
  });
  await router.push('/');
  app.use(router);
  const { default: Home } = await import('../src/pages/home/Home.vue');
  // Vitest transforms SFCs for SSR. Compile the actual template for reactive
  // host rendering while retaining Home's actual setup and HTTP/query pipeline.
  const source = readFileSync(
    new URL('../src/pages/home/Home.vue', import.meta.url),
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + '<template>'.length,
    source.lastIndexOf('</template>'),
  );
  const ClientHome = {
    ...Home,
    setup(props: unknown, context: unknown) {
      return { ...Home.setup(props, context) };
    },
    render: Vue.compile(template),
  };
  const root = node('root');
  const mounted = renderer.createApp(ClientHome);
  mounted.use(pinia);
  mounted.use(PiniaColada);
  mounted.use(router);
  mounted.provide(Vue.ssrContextKey, { modules: new Set() });
  const pass = Vue.defineComponent({
    setup:
      (_props, { attrs, slots }) =>
      () =>
        Vue.h('div', attrs, slots.default?.()),
  });
  for (const name of [
    'n-h1',
    'n-input-group',
    'n-input',
    'n-button',
    'n-flex',
    'n-icon',
    'n-a',
    'n-p',
    'n-divider',
    'n-qr-code',
    'bulletin',
    'section-header',
    'c-button',
    'c-modal',
  ])
    mounted.component(name, pass);
  mounted.component(
    'PanelWebNovel',
    Vue.defineComponent({
      props: ['novels'],
      setup: (props) => () =>
        Vue.h(
          'div',
          {},
          props.novels
            ?.map((novel: { titleJp: string }) => novel.titleJp)
            .join('|') ?? '',
        ),
    }),
  );
  mounted.component('PanelWenkuNovel', pass);
  signIn();
  mounted.mount(root);
  await Vue.nextTick();
  cleanups.push(() => {
    signIn();
    mounted.unmount();
    disposePinia(pinia);
  });
  return { requests, root };
}
const page = (owner: string) =>
  Response.json({
    total: 1,
    items: [{ providerId: 'syosetu', novelId: owner, titleJp: owner }],
  });

describe('actual home deployment and private-list boundaries', () => {
  it('renders usage/project references without upstream groups, modal or maintenance notice', async () => {
    const { root, requests } = await setup();
    const text = content(root);
    expect(text).toContain('使用说明');
    expect(text).toContain('GitHub');
    for (const unwanted of [
      'QQ群',
      'Telegram',
      'FishHawk',
      '819513328',
      'qm.qq.com',
      't.me/',
      '论坛反馈',
      '加群',
    ])
      expect(text).not.toContain(unwanted);
    expect(requests).toHaveLength(0);
  });
  it('clears rendered Alice data during direct Bob switch and logout/relogin pending', async () => {
    const { root, requests } = await setup();
    signIn(1);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(new URL(requests[0].request.url).searchParams.get('pageSize')).toBe(
      '8',
    );
    requests[0].resolve(page('alice-private'));
    await vi.waitFor(() => expect(content(root)).toContain('alice-private'));
    signIn(2);
    await Vue.nextTick();
    expect(content(root)).not.toContain('alice-private');
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].request.headers.get('Authorization')).toBe(
      'Bearer test-2',
    );
    requests[1].resolve(page('bob-private'));
    await vi.waitFor(() => expect(content(root)).toContain('bob-private'));
    signIn();
    await Vue.nextTick();
    expect(content(root)).not.toContain('bob-private');
    signIn(2);
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(content(root)).not.toContain('bob-private');
    signIn();
    await Vue.nextTick();
    expect(requests[2].request.signal.aborted).toBe(true);
    requests[2].resolve(page('late-private'));
    await Vue.nextTick();
    expect(content(root)).not.toContain('late-private');
  });
  it('cancels a pending Alice homepage request when Bob signs in directly', async () => {
    const { root, requests } = await setup();
    signIn(1);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    signIn(2);
    await Vue.nextTick();
    expect(requests[0].request.signal.aborted).toBe(true);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[0].resolve(page('stale-alice'));
    requests[1].resolve(page('current-bob'));
    await vi.waitFor(() => expect(content(root)).toContain('current-bob'));
    expect(content(root)).not.toContain('stale-alice');
  });
});
