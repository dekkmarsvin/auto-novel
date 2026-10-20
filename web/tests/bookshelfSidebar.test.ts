import * as Vue from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, expect, it, vi } from 'vitest';
import BookshelfMenu from '../src/pages/bookshelf/components/BookshelfMenu.vue';

const boundary = vi.hoisted(() => ({ signedIn: true }));
// Glyphs and closed Naive forms are outside this navigation/SDK contract.
// Keep the real dropdown and dialog implementations without loading icon assets.
vi.mock('@vicons/material', () => ({
  MoreVertOutlined: () => Vue.h('svg'),
  CloseOutlined: () => Vue.h('svg'),
}));
vi.mock('naive-ui', () =>
  Object.fromEntries(
    ['NForm', 'NFormItemRow', 'NInput', 'NText', 'NButton', 'NIcon'].map(
      (name) => [name, { render: () => null }],
    ),
  ),
);
vi.mock('../src/stores', () => ({
  useWhoamiStore: () =>
    Vue.reactive({ whoami: Vue.ref({ isSignedIn: boundary.signedIn }) }),
  FavoredRepo: {
    useFavoredStore: () =>
      Vue.reactive({
        favoreds: Vue.ref({
          web: [{ id: 'default', title: '遠端收藏' }],
          wenku: [{ id: 'default', title: '文庫收藏' }],
          local: [
            { id: 'default', title: '預設本地' },
            { id: 'local-1', title: '本地清單' },
          ],
        }),
      }),
  },
}));
vi.mock('../src/pages/bookshelf/BookshelfLocalStore', () => ({
  useBookshelfLocalStore: () => ({ volumes: [] }),
}));

afterEach(() => {
  boundary.signedIn = true;
});

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }],
  });
  await router.push('/favorite/local/local-1');
  return renderToString(
    Vue.createSSRApp(BookshelfMenu, { value: 'local/local-1' }).use(router),
  );
}

it('renders real SDK menu triggers beside navigation links and marks only the active folder', async () => {
  const html = await render();
  expect(html).toContain('<nav aria-label="收藏夹"');
  const rows = html.match(/<li\b[^>]*>[\s\S]*?<\/li>/g) ?? [];
  const local = rows.find((row) => row.includes('本地清單'))!;
  expect(local).toMatch(/<a\b[^>]*aria-current="page"[^>]*>本地清單<\/a>/);
  expect(local).toMatch(/<\/a>[\s\S]*<button\b[^>]*aria-label="更多操作"/);
  expect(local).not.toMatch(/<a\b[^>]*>[\s\S]*<button[\s\S]*<\/a>/);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).not.toContain('role="menuitem"');
});

it('does not render remote folder names for guests, while keeping local folders available', async () => {
  boundary.signedIn = false;
  const html = await render();
  expect(html).toContain('本地清單');
  expect(html).not.toContain('遠端收藏');
  expect(html).not.toContain('文庫收藏');
});
