import * as Vue from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, expect, it, vi } from 'vitest';
import WebNovelEdit from '../src/pages/novel/WebNovelEdit.vue';

const boundary = vi.hoisted(() => ({ fetch: vi.fn(), novel: {} }));
vi.mock('../src/webKit', async () => {
  const { default: ky } = await import('ky');
  return {
    isLocalAuth: false,
    webKit: {
      createClient: (prefix: string) =>
        ky.create({
          prefix: `https://books.test${prefix}`,
          fetch: boundary.fetch,
        }),
    },
  };
});
vi.mock('../src/repos', async () => {
  const { WebNovelApi } = await import('../src/api/WebNovelApi');
  return {
    WebNovelRepo: {
      // The query's resolved data is the input boundary. Keep the production
      // SFC mapping and API serialization for the actual submission.
      useWebNovel: () => ({ refresh: async () => ({ data: boundary.novel }) }),
      updateNovelTranslation: WebNovelApi.updateNovelTranslation,
      updateNovelWenkuId: WebNovelApi.updateNovelWenkuId,
    },
  };
});
vi.mock('../src/pages/util', () => ({ useIsWideScreen: () => Vue.ref(true) }));
vi.mock('../src/stores', () => ({ useWhoamiStore: () => ({}) }));
vi.mock('@novelia/web-kit', () => ({
  Toast: { promise: (promise: Promise<unknown>) => promise, warning: vi.fn() },
}));
vi.mock('@vicons/material', () => ({ UploadOutlined: {} }));
vi.mock('naive-ui', () => ({}));

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
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.clearAllMocks();
});

it('keeps same-title chapters distinct and submits chapter IDs while retaining title keys for section headings', async () => {
  boundary.novel = {
    titleJp: '題名',
    introductionJp: '紹介',
    toc: [
      { chapterId: 'chapter-1', titleJp: '同名', titleZh: '一' },
      { chapterId: 'chapter-2', titleJp: '同名', titleZh: '二' },
      { titleJp: '幕間', titleZh: '段落' },
    ],
  };
  const puts: { url: string; body: unknown }[] = [];
  boundary.fetch.mockImplementation(async (request: Request) => {
    puts.push({ url: request.url, body: await request.json() });
    return new Response(null, { status: 204 });
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  });
  await router.push('/novel/syosetu/n1/edit');
  let controls!: {
    formValue: Vue.Ref<{ toc: { key: string; jp: string; zh: string }[] }>;
    submit(): Promise<void>;
  };
  const app = renderer.createApp({
    setup() {
      controls = WebNovelEdit.setup!(
        { providerId: 'syosetu', novelId: 'n1' },
        { expose() {}, emit() {} },
      ) as typeof controls;
      return () => null;
    },
  });
  app.use(router).provide(Vue.ssrContextKey, {});
  app.mount({});
  cleanups.push(() => app.unmount());
  await Vue.nextTick();
  expect(controls.formValue.value.toc).toEqual([
    { key: 'chapter-1', jp: '同名', zh: '一' },
    { key: 'chapter-2', jp: '同名', zh: '二' },
    { key: '幕間', jp: '幕間', zh: '段落' },
  ]);
  controls.formValue.value.toc[0].zh = '第一章';
  controls.formValue.value.toc[1].zh = '第二章';
  await controls.submit();
  expect(puts.find(({ url }) => url.endsWith('/translation'))).toEqual({
    url: 'https://books.test/api/novel/syosetu/n1/translation',
    body: {
      title: '',
      introduction: '',
      toc: { 'chapter-1': '第一章', 'chapter-2': '第二章', 幕間: '段落' },
    },
  });
});
