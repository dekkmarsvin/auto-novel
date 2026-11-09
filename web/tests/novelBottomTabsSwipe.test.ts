import { readFileSync } from 'node:fs';
import * as Vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Tabs from '../src/pages/novel/components/NovelBottomTabs.vue';
import { useGlossaryDraft } from '../src/components/glossaryDraft';
import { GenericNovelId } from '../src/model/Common';

const boundary = vi.hoisted(() => ({
  draft: null as ReturnType<typeof useGlossaryDraft> | null,
  confirmLeave: vi.fn(),
  answer: null as ((allow: boolean) => void) | null,
  commentsMounted: vi.fn(),
}));
vi.mock('../src/config', () => ({ commentsAvailable: () => false }));
vi.mock('../src/util', () => import('../src/util/useHorizontalSwipe'));
vi.mock('../src/components/NovelGlossaryEditor.vue', () => ({ default: {} }));
vi.mock('../src/components/CommunityComments.vue', () => ({ default: {} }));
vi.mock('../src/api/novel/WebNovelApi', () => ({ WebNovelApi: {} }));
vi.mock('../src/api/novel/WenkuNovelApi', () => ({ WenkuNovelApi: {} }));
vi.mock('naive-ui', () => ({}));

class HostNode extends EventTarget {
  attrs: Record<string, unknown> = {};
  children: HostNode[] = [];
  parent?: HostNode;
  text?: string;
  scrollWidth = 100;
  clientWidth = 100;
  isContentEditable = false;
  ownerDocument = {
    body: null,
    defaultView: { getComputedStyle: () => ({ overflowX: 'visible' }) },
  };
  constructor(readonly tag = '') {
    super();
  }
  get parentElement() {
    return this.parent;
  }
  getRootNode() {
    return { activeElement: null };
  }
  closest() {
    return /^(input|textarea|select)$/.test(this.tag) ? this : null;
  }
}
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: (tag) => new HostNode(tag),
  createText: (text) => Object.assign(new HostNode(), { text }),
  createComment: () => new HostNode(),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.text = text;
    node.children = [];
  },
  patchProp: (node, key, _old, next) => {
    node.attrs[key] = next;
  },
  parentNode: (node) => node.parent ?? null,
  nextSibling(node) {
    const siblings = node.parent?.children ?? [];
    return siblings[siblings.indexOf(node) + 1] ?? null;
  },
  insert(node, parent, anchor) {
    if (node.parent)
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  remove(node) {
    if (node.parent)
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = undefined;
  },
});
function find(node: HostNode, tag: string): HostNode | undefined {
  return node.tag === tag
    ? node
    : node.children.map((child) => find(child, tag)).find(Boolean);
}
function touch(root: HostNode, type: string, x: number, origin = root) {
  const event = new Event(type);
  Object.defineProperties(event, {
    target: { value: origin },
    touches: { value: [{ clientX: x, clientY: 20 }] },
  });
  root.dispatchEvent(event);
}
async function swipe(
  root: HostNode,
  direction: 'left' | 'right',
  origin = root,
) {
  touch(root, 'touchstart', 100, origin);
  touch(root, 'touchmove', direction === 'left' ? 0 : 200, origin);
  root.dispatchEvent(new Event('touchend'));
  await Vue.nextTick();
}
const apps: ReturnType<typeof renderer.createApp>[] = [];
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  boundary.draft = null;
  boundary.answer = null;
});

async function mount(wenku: boolean) {
  vi.stubGlobal('window', new EventTarget());
  const source = readFileSync(
    new URL(
      '../src/pages/novel/components/NovelBottomTabs.vue',
      import.meta.url,
    ),
    'utf8',
  );
  const template = source.slice(
    source.indexOf('<template>') + 10,
    source.lastIndexOf('</template>'),
  );
  const Component = {
    ...Tabs,
    setup(props: unknown, context: unknown) {
      return { ...Tabs.setup(props, context) };
    },
    // Real consumer setup/template and real native gesture binding. Only the
    // visual tab shell and editor confirmation UI are boundary fixtures.
    render: Vue.compile(template),
  };
  const app = renderer.createApp({
    render: () =>
      Vue.h(
        Component,
        {
          gnid: wenku
            ? GenericNovelId.wenku('fixture')
            : GenericNovelId.web('syosetu', 'n1'),
          glossary: { 猫: '貓' },
          themeGlossaryId: 'shared-theme',
          site: 'fixture',
          hideComment: false,
        },
        wenku ? { wenkuToc: () => Vue.h('toc') } : {},
      ),
  });
  app.provide(Vue.ssrContextKey, {});
  app.component(
    'n-tabs',
    Vue.defineComponent({
      props: { value: String },
      setup:
        (props, { slots }) =>
        () =>
          Vue.h('tabs', { active: props.value }, slots.default?.()),
    }),
  );
  app.component(
    'n-tab-pane',
    Vue.defineComponent({
      setup:
        (_props, { slots }) =>
        () =>
          Vue.h('pane', {}, slots.default?.()),
    }),
  );
  app.component(
    'NovelGlossaryEditor',
    Vue.defineComponent({
      props: {
        value: { type: Object, required: true },
        themeGlossaryId: String,
      },
      setup(props, { expose }) {
        const draft = useGlossaryDraft(() => ({
          glossary: props.value,
          themeGlossaryId: props.themeGlossaryId,
        }));
        boundary.draft = draft;
        boundary.confirmLeave.mockImplementation(() =>
          draft.isGlossaryChanged()
            ? new Promise<boolean>((resolve) => {
                boundary.answer = (allow) => {
                  if (allow) draft.resetState();
                  resolve(allow);
                };
              })
            : true,
        );
        expose({ confirmLeave: boundary.confirmLeave });
        return () => Vue.h('editor', { theme: draft.themeGlossaryId.value });
      },
    }),
  );
  app.component(
    'CommunityComments',
    Vue.defineComponent({
      setup() {
        boundary.commentsMounted();
        return () => Vue.h('comments');
      },
    }),
  );
  const host = new HostNode('host');
  app.mount(host);
  apps.push(app);
  await Vue.nextTick();
  return {
    root: find(host, 'div')!,
    tabs: find(host, 'tabs')!,
    editor: find(host, 'editor')!,
  };
}

describe('novel bottom-tab gestures through the actual consumer', () => {
  it('asks before leaving pending ThemeGlossary input, preserves a cancelled draft and switches only after confirmation', async () => {
    const { root, tabs, editor } = await mount(true);
    expect(tabs.attrs.active).toBe('wenkuToc');
    await swipe(root, 'left');
    expect(tabs.attrs.active).toBe('glossary');
    expect(editor.attrs.theme).toBe('shared-theme');
    boundary.draft!.termsToAdd.value = ['未加入的新詞', '草稿'];
    await swipe(root, 'right');
    expect(boundary.confirmLeave).toHaveBeenCalledOnce();
    expect(tabs.attrs.active).toBe('glossary');
    boundary.answer!(false);
    await Vue.nextTick();
    expect(tabs.attrs.active).toBe('glossary');
    expect(boundary.draft!.termsToAdd.value).toEqual(['未加入的新詞', '草稿']);
    expect(boundary.draft!.themeGlossaryId.value).toBe('shared-theme');
    expect(boundary.draft!.glossary.value).toEqual({ 猫: '貓' });
    await swipe(root, 'right');
    boundary.answer!(true);
    await vi.waitFor(() => expect(tabs.attrs.active).toBe('wenkuToc'));
    expect(boundary.draft!.termsToAdd.value).toEqual(['', '']);
    expect(boundary.commentsMounted).not.toHaveBeenCalled();
  });

  it('ignores gestures starting in an editor input', async () => {
    const { root, tabs } = await mount(true);
    await swipe(root, 'left', new HostNode('input'));
    expect(tabs.attrs.active).toBe('wenkuToc');
    expect(boundary.confirmLeave).not.toHaveBeenCalled();
  });

  it('does not invent a comment tab or wrap at either edge when community is disabled', async () => {
    const { root, tabs } = await mount(false);
    expect(tabs.attrs.active).toBe('glossary');
    await swipe(root, 'left');
    await swipe(root, 'right');
    expect(tabs.attrs.active).toBe('glossary');
    expect(boundary.confirmLeave).not.toHaveBeenCalled();
    expect(boundary.commentsMounted).not.toHaveBeenCalled();
  });
});
